const sequelize = require('../config/database');
const School = require('./School');
const Student = require('./Student');
const Transaction = require('./Transaction');
const PayrollConfig = require('./PayrollConfig');
const PayrollStaff = require('./PayrollStaff');
const PayrollLog = require('./PayrollLog');
const Forecast = require('./Forecast');
const AuditLog = require('./AuditLog');

// Associations
School.hasMany(Student, { foreignKey: 'school_id', as: 'students' });
Student.belongsTo(School, { foreignKey: 'school_id' });

School.hasMany(Transaction, { foreignKey: 'school_id', as: 'transactions' });
Transaction.belongsTo(School, { foreignKey: 'school_id' });

Student.hasMany(Transaction, { foreignKey: 'student_id', as: 'transactions' });
Transaction.belongsTo(Student, { foreignKey: 'student_id' });

School.hasOne(PayrollConfig, { foreignKey: 'school_id', as: 'payrollConfig' });
PayrollConfig.belongsTo(School, { foreignKey: 'school_id' });

School.hasMany(PayrollStaff, { foreignKey: 'school_id', as: 'staff' });
PayrollStaff.belongsTo(School, { foreignKey: 'school_id' });

School.hasMany(PayrollLog, { foreignKey: 'school_id', as: 'payrollLogs' });
PayrollLog.belongsTo(School, { foreignKey: 'school_id' });

School.hasMany(Forecast, { foreignKey: 'school_id', as: 'forecasts' });
Forecast.belongsTo(School, { foreignKey: 'school_id' });

School.hasMany(AuditLog, { foreignKey: 'school_id', as: 'auditLogs' });
AuditLog.belongsTo(School, { foreignKey: 'school_id' });

module.exports = {
  sequelize,
  School,
  Student,
  Transaction,
  PayrollConfig,
  PayrollStaff,
  PayrollLog,
  Forecast,
  AuditLog,
};
