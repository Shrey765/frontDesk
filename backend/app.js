import express from 'express'

const app = express();

app.get('/', (req, res) => {
  res.send('<h1>Your Express server is alive!</h1>');
});

// Now, all your other endpoints
app.get('/api/hello', (req, res) => {
  res.json({ message: '👋 Hello from your Express API!' });
});

export default app;