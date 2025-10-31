import express from 'express'
import cors from 'cors'

const app = express();
app.use(cors());
app.use(express.json({limit: '50mb'}))

app.get('/', (req, res) => {
  res.send('<h1>Your Express server is alive!</h1>');
});

//Api routes
import router from './routes/api.js';
app.use('/api/v1', router);

export default app;