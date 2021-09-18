/**
 * Import external libraries
 */
import Service from 'alfred-base';
import { createRequire } from 'module';
import DebugModule from 'debug';

/**
 * Import internal libraries
 */
import nest from '../collectors/nest/nest.mjs';
import SensorsAPI from '../api/sensors/sensors.mjs';
import schedulesAPI from '../api/schedules/schedules.mjs';
import schedules from '../schedules/schedules.mjs';

const debug = new DebugModule('Nest:Server');

// Setup service options
const require = createRequire(import.meta.url); // construct the require method
const nodePackageConfig = require('../../package.json');

const options = {
  serviceName: nodePackageConfig.description,
  namespace: nodePackageConfig.name,
  serviceVersion: nodePackageConfig.version,
};

// Bind data collector functions to base class
Object.assign(Service.prototype, nest);

// Bind api functions to base class
Object.assign(Service.prototype, SensorsAPI);
Object.assign(Service.prototype, schedulesAPI);

// Bind schedule functions to base class
Object.assign(Service.prototype, schedules);

// Create base service
const service = new Service(options);

async function setupServer() {
  // Setup service
  await service.createRestifyServer();

  // Apply api routes
  service.restifyServer.get('/schedules', (req, res, next) =>
    service._listSchedules(req, res, next),
  );
  debug(`Added get '/schedules' api`);

  service.restifyServer.get('/schedules/:scheduleID', (req, res, next) =>
    service._listSchedule(req, res, next),
  );
  debug(`Added get '/schedules/:scheduleID' api`);

  service.restifyServer.put('/schedules/:scheduleID', (req, res, next) =>
    service._saveSchedule(req, res, next),
  );
  debug(`Added put '/schedules/:scheduleID' api`);

  service.restifyServer.get('/sensors', (req, res, next) =>
    service._sensors(req, res, next),
  );
  debug(`Added get '/sensors' api`);

  service.restifyServer.get('/sensors/current', (req, res, next) =>
    service._current(req, res, next),
  );
  debug(`Added get '/sensors/current' api`);

  service.restifyServer.put('/sensors/heating', (req, res, next) =>
    service._heating(req, res, next),
  );
  debug(`Added put '/sensors/heating' api`);

  service.restifyServer.get('/masterEcoMode', (req, res, next) =>
    service._masterEcoMode(req, res, next),
  );
  debug(`Added get '/masterEcoMode' api`);

  if (process.env.MOCK === 'true') {
    this.logger.info('Mocking enabled, will not monitor Nest events');
  } else {
    await service._getNestData(); // Collect Nest device data
    if (process.env.NO_SCHEDULE === 'true') {
      service.logger.info('Collect data only and do not set any schedules');
    } else {
      await service.setupSchedules(); // Add schedules
    }
  }

  // Listen for api requests
  service.listen();
}
setupServer();
