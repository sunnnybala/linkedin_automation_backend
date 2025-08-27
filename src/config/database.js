const { Sequelize } = require('sequelize');
require('dotenv').config();

// Prefer single connection string if provided (Render DATABASE_INTERNAL_URL or DATABASE_URL)
const connectionString = process.env.DATABASE_INTERNAL_URL || process.env.DATABASE_URL;

let sequelize;

if (connectionString) {
  const isInternal = Boolean(process.env.DATABASE_INTERNAL_URL);
  // Allow explicit override; otherwise default to SSL for external URLs and no SSL for internal
  const sslFlag = (process.env.DB_SSL || '').toLowerCase();
  const enableSsl = sslFlag ? (sslFlag === 'true' || sslFlag === '1') : !isInternal;

  sequelize = new Sequelize(connectionString, {
    dialect: 'postgres',
    logging: process.env.NODE_ENV === 'development' ? console.log : false,
    dialectOptions: enableSsl ? { ssl: { require: true, rejectUnauthorized: false } } : {},
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000
    }
  });
} else {
  // Fallback to discrete connection parameters
  sequelize = new Sequelize(
    process.env.DB_NAME,
    process.env.DB_USER,
    process.env.DB_PASSWORD,
    {
      host: process.env.DB_HOST,
      port: process.env.DB_PORT || 5432,
      dialect: 'postgres',
      logging: process.env.NODE_ENV === 'development' ? console.log : false,
      pool: {
        max: 5,
        min: 0,
        acquire: 30000,
        idle: 10000
      }
    }
  );
}

module.exports = sequelize;
