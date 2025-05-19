require("dotenv").config();
console.log(process.env.DB_HOST);

module.exports = {
  // development: {
  //   username: 'root',
  //   password: 'root',
  //   database: 'gestion_stock',
  //   host: 'localhost',
  //   dialect: 'mysql',
  // },

  development: {
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASS,
    database: process.env.DB_DATABASE,
    host: process.env.DB_HOST,
    dialect: "mysql",
    port: process.env.DB_PORT,
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false, // Use true with CA
        // ca: fs.readFileSync('path/to/aiven-ca.pem'),
      },
    },
  },

  test: {
    username: "root",
    password: null,
    database: "database_test",
    host: "127.0.0.1",
    dialect: "mysql",
  },
  production: {
    username: "root",
    password: null,
    database: "database_production",
    host: "127.0.0.1",
    dialect: "mysql",
  },
};
