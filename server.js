const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { createApp } = require('./src/app');

const port = Number(process.env.PORT || 3000);
const app = createApp();

app.listen(port, () => {
  console.log(`Destinations With Deanna listening on port ${port}`);
  console.log(`Admin login: username admin / password password`);
});
