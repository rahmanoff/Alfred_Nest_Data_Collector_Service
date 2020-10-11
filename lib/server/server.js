/**
 * Import external libraries
 */
const { Service } = require('alfred-base');

// Setup service options
const { version } = require('../../package.json');
const serviceName = require('../../package.json').description;
const namespace = require('../../package.json').name;

const options = {
  serviceName,
  namespace,
  serviceVersion: version,
};

// Bind data collector functions to base class
Object.assign(Service.prototype, require('../collectors/nest/nest'));

// Bind api functions to base class
Object.assign(Service.prototype, require('../api/sensors/sensors'));

// Create base service
const service = new Service(options);

async function setupServer() {
  // Setup service
  await service.createRestifyServer();

  // Apply api routes
  service.restifyServer.get('/sensors', (req, res, next) =>
    service._sensors(req, res, next),
  );
  service.logger.trace(`${service._traceStack()} - Added '/sensora' api`);

  service.restifyServer.get('/sensors/current', (req, res, next) =>
    service._current(req, res, next),
  );
  service.logger.trace(
    `${service._traceStack()} - Added '/sensors/current' api`,
  );

  service.restifyServer.put('/sensors/heating', (req, res, next) =>
    service._heating(req, res, next),
  );
  service.logger.trace(
    `${service._traceStack()} - Added '/sensors/heating' api`,
  );

  // Listen for api requests
  service.listen();

  if (process.env.MOCK === 'true') {
    this.logger.info('Mocking enabled, will not monitor Nest events');
  } else {
    service._getNestData(); // Collect Nest device data
  }
}
setupServer();
