const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { once } = require('node:events');

const { createApp, DEFAULT_DATA, hashPassword } = require('./app');

function createSeedData(overrides = {}) {
  return {
    users: [
      {
        id: 1,
        name: 'User MyMoney',
        email: 'user@mymoney.local',
        password_hash: hashPassword('user12345'),
        role: 'user'
      },
      ...(overrides.users || [])
    ],
    transactions: [...DEFAULT_DATA.transactions, ...(overrides.transactions || [])],
    categories: [...DEFAULT_DATA.categories, ...(overrides.categories || [])],
    budgets: [...DEFAULT_DATA.budgets, ...(overrides.budgets || [])]
  };
}

async function withApi(seedData, run) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'finance-backend-'));
  const dbFile = path.join(tempDir, 'db.json');
  fs.writeFileSync(dbFile, JSON.stringify(seedData, null, 2));

  const { app, db } = createApp({ dbFile });
  const server = http.createServer(app);
  server.listen(0);
  await once(server, 'listening');

  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    await run({ baseUrl, db });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

async function jsonRequest(baseUrl, route, options = {}) {
  const hasBody = options.body !== undefined;
  const response = await fetch(`${baseUrl}${route}`, {
    method: options.method || 'GET',
    headers: hasBody ? { 'content-type': 'application/json', ...(options.headers || {}) } : options.headers,
    body: hasBody ? JSON.stringify(options.body) : undefined
  });

  const text = await response.text();
  return {
    status: response.status,
    body: text ? JSON.parse(text) : null
  };
}

async function loginAsUser(baseUrl) {
  const response = await jsonRequest(baseUrl, '/api/auth/login', {
    method: 'POST',
    body: {
      email: 'user@mymoney.local',
      password: 'user12345'
    }
  });

  assert.equal(response.status, 200);
  return response.body.token;
}

test('POST /api/transactions rejects invalid category ids', async () => {
  await withApi(createSeedData(), async ({ baseUrl, db }) => {
    const token = await loginAsUser(baseUrl);
    const response = await jsonRequest(baseUrl, '/api/transactions', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`
      },
      body: {
        description: 'Tes invalid',
        amount: 1000,
        category_id: 999999
      }
    });

    assert.equal(response.status, 400);
    assert.match(response.body.error, /does not exist/i);
    assert.equal(db.get('transactions').value().length, 0);
  });
});

test('POST /api/auth/login returns a single user role and token for valid credentials', async () => {
  await withApi(createSeedData(), async ({ baseUrl }) => {
    const response = await jsonRequest(baseUrl, '/api/auth/login', {
      method: 'POST',
      body: {
        email: 'user@mymoney.local',
        password: 'user12345'
      }
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.user.role, 'user');
    assert.ok(response.body.token);
  });
});

test('GET /api/transactions requires authorization token', async () => {
  await withApi(createSeedData(), async ({ baseUrl }) => {
    const unauthorized = await jsonRequest(baseUrl, '/api/transactions');
    assert.equal(unauthorized.status, 401);

    const login = await jsonRequest(baseUrl, '/api/auth/login', {
      method: 'POST',
      body: {
        email: 'user@mymoney.local',
        password: 'user12345'
      }
    });

    const authorized = await jsonRequest(baseUrl, '/api/transactions', {
      headers: {
        authorization: `Bearer ${login.body.token}`
      }
    });

    assert.equal(authorized.status, 200);
    assert.ok(Array.isArray(authorized.body));
  });
});

test('POST /api/auth/register creates a new user with hashed password and returns a user session', async () => {
  await withApi(createSeedData({ users: [] }), async ({ baseUrl, db }) => {
    const register = await jsonRequest(baseUrl, '/api/auth/register', {
      method: 'POST',
      body: {
        name: 'Alya',
        email: 'alya@example.com',
        password: 'rahasia123'
      }
    });

    assert.equal(register.status, 201);
    assert.equal(register.body.user.role, 'user');
    assert.ok(register.body.token);

    const storedUser = db.get('users').find({ email: 'alya@example.com' }).value();
    assert.ok(storedUser);
    assert.ok(storedUser.password_hash);
    assert.notEqual(storedUser.password_hash, 'rahasia123');

    const login = await jsonRequest(baseUrl, '/api/auth/login', {
      method: 'POST',
      body: {
        email: 'alya@example.com',
        password: 'rahasia123'
      }
    });

    assert.equal(login.status, 200);
    assert.equal(login.body.user.email, 'alya@example.com');
  });
});

test('POST /api/transactions derives type from the selected category', async () => {
  await withApi(createSeedData(), async ({ baseUrl, db }) => {
    const token = await loginAsUser(baseUrl);
    const response = await jsonRequest(baseUrl, '/api/transactions', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`
      },
      body: {
        description: 'Salary without keyword',
        amount: 2500000,
        type: 'expense',
        category_id: 1
      }
    });

    assert.equal(response.status, 201);
    assert.equal(response.body.type, 'income');
    assert.equal(db.get('transactions').value()[0].type, 'income');
  });
});

test('DELETE /api/categories blocks categories that are still referenced', async () => {
  const currentMonth = new Date().toISOString().slice(0, 7);

  await withApi(
    createSeedData({
      transactions: [
        {
          id: 1001,
          description: 'Makan siang',
          amount: 30000,
          type: 'expense',
          category_id: 3,
          date: '10/04/2026',
          month: currentMonth,
          timestamp: 1001
        }
      ]
    }),
    async ({ baseUrl, db }) => {
      const token = await loginAsUser(baseUrl);
      const response = await jsonRequest(baseUrl, '/api/categories/3', {
        method: 'DELETE',
        headers: {
          authorization: `Bearer ${token}`
        }
      });

      assert.equal(response.status, 409);
      assert.match(response.body.error, /cannot be deleted/i);
      assert.ok(db.get('categories').find({ id: 3 }).value());
    }
  );
});

test('POST /api/budgets rejects income categories and over-allocation', async () => {
  const currentMonth = new Date().toISOString().slice(0, 7);

  await withApi(
    createSeedData({
      transactions: [
        {
          id: 2001,
          description: 'Gaji bulan ini',
          amount: 1000000,
          type: 'income',
          category_id: 1,
          date: '01/04/2026',
          month: currentMonth,
          timestamp: 2001
        }
      ],
      budgets: [
        {
          id: 3001,
          category_id: 3,
          amount: 900000,
          month: currentMonth,
          date: '01/04/2026',
          timestamp: 3001
        }
      ]
    }),
    async ({ baseUrl }) => {
      const token = await loginAsUser(baseUrl);
      const wrongType = await jsonRequest(baseUrl, '/api/budgets', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`
        },
        body: {
          category_id: 1,
          amount: 100000
        }
      });

      assert.equal(wrongType.status, 400);
      assert.match(wrongType.body.error, /only expense or savings/i);

      const overBudget = await jsonRequest(baseUrl, '/api/budgets', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`
        },
        body: {
          category_id: 4,
          amount: 200000
        }
      });

      assert.equal(overBudget.status, 400);
      assert.match(overBudget.body.error, /exceeds current month income/i);
    }
  );
});

test('GET /api/summary classifies salary by category metadata instead of description', async () => {
  const currentMonth = new Date().toISOString().slice(0, 7);

  await withApi(
    createSeedData({
      transactions: [
        {
          id: 4001,
          description: 'Paycheck transfer',
          amount: 5000000,
          type: 'income',
          category_id: 1,
          date: '01/04/2026',
          month: currentMonth,
          timestamp: 4001
        },
        {
          id: 4002,
          description: 'gaji side project',
          amount: 700000,
          type: 'income',
          category_id: 2,
          date: '02/04/2026',
          month: currentMonth,
          timestamp: 4002
        }
      ]
    }),
    async ({ baseUrl }) => {
      const token = await loginAsUser(baseUrl);
      const authorizedResponse = await jsonRequest(baseUrl, '/api/summary', {
        headers: {
          authorization: `Bearer ${token}`
        }
      });

      assert.equal(authorizedResponse.status, 200);
      assert.equal(authorizedResponse.body.income_salary, 5000000);
      assert.equal(authorizedResponse.body.income_other, 700000);
      assert.equal(authorizedResponse.body.total_income_this_month, 5700000);
    }
  );
});

test('GET /api/summary does not reduce savings balance for savings deposits', async () => {
  const currentMonth = new Date().toISOString().slice(0, 7);

  await withApi(
    createSeedData({
      transactions: [
        {
          id: 5001,
          description: 'Gaji bulan ini',
          amount: 3000000,
          type: 'income',
          flow: 'in',
          category_id: 1,
          date: '01/04/2026',
          month: currentMonth,
          timestamp: 5001
        },
        {
          id: 5002,
          description: 'Setor tabungan',
          amount: 700000,
          type: 'savings',
          flow: 'in',
          category_id: 4,
          date: '02/04/2026',
          month: currentMonth,
          timestamp: 5002
        }
      ],
      budgets: [
        {
          id: 5101,
          category_id: 4,
          amount: 700000,
          month: currentMonth,
          date: '01/04/2026',
          timestamp: 5101
        }
      ]
    }),
    async ({ baseUrl }) => {
      const token = await loginAsUser(baseUrl);
      const response = await jsonRequest(baseUrl, '/api/summary', {
        headers: {
          authorization: `Bearer ${token}`
        }
      });

      assert.equal(response.status, 200);
      assert.equal(response.body.savings_balance, 700000);
    }
  );
});

test('POST /api/transactions rejects expense transactions above remaining allocation', async () => {
  const currentMonth = new Date().toISOString().slice(0, 7);

  await withApi(
    createSeedData({
      transactions: [
        {
          id: 6001,
          description: 'Gaji bulan ini',
          amount: 2000000,
          type: 'income',
          flow: 'in',
          category_id: 1,
          date: '01/04/2026',
          month: currentMonth,
          timestamp: 6001
        },
        {
          id: 6002,
          description: 'Makan pertama',
          amount: 150000,
          type: 'expense',
          flow: 'out',
          category_id: 3,
          date: '02/04/2026',
          month: currentMonth,
          timestamp: 6002
        }
      ],
      budgets: [
        {
          id: 6101,
          category_id: 3,
          amount: 200000,
          month: currentMonth,
          date: '01/04/2026',
          timestamp: 6101
        }
      ]
    }),
    async ({ baseUrl, db }) => {
      const token = await loginAsUser(baseUrl);
      const response = await jsonRequest(baseUrl, '/api/transactions', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`
        },
        body: {
          description: 'Makan kedua',
          amount: 60000,
          category_id: 3
        }
      });

      assert.equal(response.status, 400);
      assert.match(response.body.error, /melebihi sisa alokasi/i);
      assert.equal(db.get('transactions').value().length, 2);
    }
  );
});

test('POST /api/transactions allows savings transactions within allocated amount and stores inbound flow', async () => {
  const currentMonth = new Date().toISOString().slice(0, 7);

  await withApi(
    createSeedData({
      transactions: [
        {
          id: 7001,
          description: 'Gaji bulan ini',
          amount: 2500000,
          type: 'income',
          flow: 'in',
          category_id: 1,
          date: '01/04/2026',
          month: currentMonth,
          timestamp: 7001
        }
      ],
      budgets: [
        {
          id: 7101,
          category_id: 4,
          amount: 500000,
          month: currentMonth,
          date: '01/04/2026',
          timestamp: 7101
        }
      ]
    }),
    async ({ baseUrl, db }) => {
      const token = await loginAsUser(baseUrl);
      const response = await jsonRequest(baseUrl, '/api/transactions', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`
        },
        body: {
          description: 'Tabungan rutin',
          amount: 500000,
          category_id: 4
        }
      });

      assert.equal(response.status, 201);
      assert.equal(response.body.type, 'savings');
      assert.equal(response.body.flow, 'in');
      assert.equal(db.get('transactions').value()[1].flow, 'in');
    }
  );
});

test('POST /api/transactions allows savings withdrawals within available savings balance', async () => {
  const currentMonth = new Date().toISOString().slice(0, 7);

  await withApi(
    createSeedData({
      transactions: [
        {
          id: 8001,
          description: 'Setor tabungan awal',
          amount: 800000,
          type: 'savings',
          flow: 'in',
          category_id: 4,
          date: '01/04/2026',
          month: currentMonth,
          timestamp: 8001
        }
      ]
    }),
    async ({ baseUrl, db }) => {
      const token = await loginAsUser(baseUrl);
      const response = await jsonRequest(baseUrl, '/api/transactions', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`
        },
        body: {
          description: 'Tarik buat kebutuhan',
          amount: 300000,
          category_id: 4,
          flow: 'out'
        }
      });

      assert.equal(response.status, 201);
      assert.equal(response.body.type, 'savings');
      assert.equal(response.body.flow, 'out');
      assert.equal(db.get('transactions').value()[1].flow, 'out');
    }
  );
});

test('POST /api/transactions rejects savings withdrawals above available savings balance', async () => {
  const currentMonth = new Date().toISOString().slice(0, 7);

  await withApi(
    createSeedData({
      transactions: [
        {
          id: 9001,
          description: 'Setor tabungan awal',
          amount: 150000,
          type: 'savings',
          flow: 'in',
          category_id: 4,
          date: '01/04/2026',
          month: currentMonth,
          timestamp: 9001
        }
      ]
    }),
    async ({ baseUrl, db }) => {
      const token = await loginAsUser(baseUrl);
      const response = await jsonRequest(baseUrl, '/api/transactions', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`
        },
        body: {
          description: 'Tarik terlalu besar',
          amount: 200000,
          category_id: 4,
          flow: 'out'
        }
      });

      assert.equal(response.status, 400);
      assert.match(response.body.error, /melebihi saldo tabungan/i);
      assert.equal(db.get('transactions').value().length, 1);
    }
  );
});

test('GET /api/summary adds savings withdrawals back to active balance and reduces savings balance', async () => {
  const currentMonth = new Date().toISOString().slice(0, 7);

  await withApi(
    createSeedData({
      transactions: [
        {
          id: 10001,
          description: 'Gaji bulan ini',
          amount: 2000000,
          type: 'income',
          flow: 'in',
          category_id: 1,
          date: '01/04/2026',
          month: currentMonth,
          timestamp: 10001
        },
        {
          id: 10002,
          description: 'Setor tabungan',
          amount: 500000,
          type: 'savings',
          flow: 'in',
          category_id: 4,
          date: '02/04/2026',
          month: currentMonth,
          timestamp: 10002
        },
        {
          id: 10003,
          description: 'Tarik tabungan',
          amount: 200000,
          type: 'savings',
          flow: 'out',
          category_id: 4,
          date: '03/04/2026',
          month: currentMonth,
          timestamp: 10003
        }
      ],
      budgets: [
        {
          id: 10101,
          category_id: 4,
          amount: 500000,
          month: currentMonth,
          date: '01/04/2026',
          timestamp: 10101
        }
      ]
    }),
    async ({ baseUrl }) => {
      const token = await loginAsUser(baseUrl);
      const response = await jsonRequest(baseUrl, '/api/summary', {
        headers: {
          authorization: `Bearer ${token}`
        }
      });

      assert.equal(response.status, 200);
      assert.equal(response.body.savings_balance, 300000);
      assert.equal(response.body.active_balance, 1700000);
    }
  );
});

test('PUT /api/transactions updates an existing savings transaction without breaking allocation checks', async () => {
  const currentMonth = new Date().toISOString().slice(0, 7);

  await withApi(
    createSeedData({
      transactions: [
        {
          id: 11001,
          description: 'Gaji bulan ini',
          amount: 2500000,
          type: 'income',
          flow: 'in',
          category_id: 1,
          date: '01/04/2026',
          month: currentMonth,
          timestamp: 11001
        },
        {
          id: 11002,
          description: 'Setor tabungan awal',
          amount: 300000,
          type: 'savings',
          flow: 'in',
          category_id: 4,
          date: '02/04/2026',
          month: currentMonth,
          timestamp: 11002
        }
      ],
      budgets: [
        {
          id: 11101,
          category_id: 4,
          amount: 500000,
          month: currentMonth,
          date: '01/04/2026',
          timestamp: 11101
        }
      ]
    }),
    async ({ baseUrl, db }) => {
      const token = await loginAsUser(baseUrl);
      const response = await jsonRequest(baseUrl, '/api/transactions/11002', {
        method: 'PUT',
        headers: {
          authorization: `Bearer ${token}`
        },
        body: {
          description: 'Setor tabungan revisi',
          amount: 450000,
          category_id: 4,
          flow: 'in'
        }
      });

      assert.equal(response.status, 200);
      assert.equal(response.body.amount, 450000);
      assert.equal(response.body.description, 'Setor tabungan revisi');
      assert.equal(db.get('transactions').find({ id: 11002 }).value().amount, 450000);
    }
  );
});

test('PUT /api/transactions rejects edited savings withdrawals above available balance', async () => {
  const currentMonth = new Date().toISOString().slice(0, 7);

  await withApi(
    createSeedData({
      transactions: [
        {
          id: 12001,
          description: 'Setor tabungan awal',
          amount: 300000,
          type: 'savings',
          flow: 'in',
          category_id: 4,
          date: '01/04/2026',
          month: currentMonth,
          timestamp: 12001
        },
        {
          id: 12002,
          description: 'Tarik kecil',
          amount: 50000,
          type: 'savings',
          flow: 'out',
          category_id: 4,
          date: '02/04/2026',
          month: currentMonth,
          timestamp: 12002
        }
      ]
    }),
    async ({ baseUrl, db }) => {
      const token = await loginAsUser(baseUrl);
      const response = await jsonRequest(baseUrl, '/api/transactions/12002', {
        method: 'PUT',
        headers: {
          authorization: `Bearer ${token}`
        },
        body: {
          description: 'Tarik terlalu besar',
          amount: 400000,
          category_id: 4,
          flow: 'out'
        }
      });

      assert.equal(response.status, 400);
      assert.match(response.body.error, /melebihi saldo tabungan/i);
      assert.equal(db.get('transactions').find({ id: 12002 }).value().amount, 50000);
    }
  );
});
