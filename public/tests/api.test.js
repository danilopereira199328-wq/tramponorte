const request = require('supertest');
const app = require('../server');

describe('API do Trampo Norte', () => {
  test('Deve devolver 401 ao tentar login com password errada', async () => {
    const res = await request(app)
      .post('/api/candidates/login')
      .send({ email: 'teste@inexistente.com', password: 'passworderrada123' });
    expect(res.statusCode).toBe(401);
    expect(res.body).toHaveProperty('error');
  });

  test('Deve devolver 401 ao tentar criar vaga sem token', async () => {
    const res = await request(app)
      .post('/api/jobs')
      .send({
        title: 'Programador', city: 'Fafe', type: 'Tempo inteiro', area: 'Tecnologia',
        description: 'Vaga de teste', contact_email: 'empresa@teste.com'
      });
    expect(res.statusCode).toBe(401);
    expect(res.body).toHaveProperty('error');
  });

  test('Deve devolver 400 ao candidatar sem CV', async () => {
    const email = `teste${Date.now()}@teste.com`;
    const regRes = await request(app)
      .post('/api/candidates/register')
      .send({ name: 'Teste', email, password: 'password12345', skills: 'JavaScript' });
    expect(regRes.statusCode).toBe(201);
    const token = regRes.body.token;

    const applyRes = await request(app)
      .post('/api/jobs/999999/apply')
      .set('Authorization', `Bearer ${token}`)
      .send();
    expect([400, 404]).toContain(applyRes.statusCode);
  });
});