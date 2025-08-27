const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/database');
const User = require('./User');

class Post extends Model {}

Post.init({
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: false,
    validate: {
      notEmpty: true,
      len: [1, 3000] // LinkedIn post character limit
    }
  },
  status: {
    type: DataTypes.ENUM('draft', 'scheduled', 'published', 'failed'),
    defaultValue: 'draft'
  },
  scheduledAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  publishedAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  linkedInPostId: {
    type: DataTypes.STRING,
    allowNull: true
  },
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {}
  }
}, {
  sequelize,
  modelName: 'Post',
  tableName: 'posts',
  timestamps: true,
  indexes: [
    {
      fields: ['userId'],
      name: 'posts_user_id_index'
    },
    {
      fields: ['scheduledAt'],
      name: 'posts_scheduled_at_index'
    },
    {
      fields: ['status'],
      name: 'posts_status_index'
    }
  ]
});

// Define associations
Post.belongsTo(User, {
  foreignKey: 'userId',
  as: 'author',
  onDelete: 'CASCADE',
  onUpdate: 'CASCADE'
});

User.hasMany(Post, {
  foreignKey: 'userId',
  as: 'posts'
});

module.exports = Post;
