module.exports = {
  testEnvironment: 'node',
  collectCoverageFrom: ['src/**/*.js', '!src/server.js'],
  transformIgnorePatterns: ['/node_modules/(?!cookie/)'],
};
