/**
 * Import external libraries
 */
import DebugModule from 'debug';
import moment from 'moment';
import { google } from 'googleapis';

const debug = new DebugModule('Nest:API_Sensor');

/**
 * @type get
 * @path /sensors
 */
async function _sensors(req, res, next) {
  debug(`Display Nest Thermostat data API called`);

  let dbConnection;
  let aggregate;
  let timeBucket;

  let { duration } = req.params;
  if (typeof duration === 'undefined' || duration === null || duration === '')
    duration = 'hour';

  try {
    switch (duration.toLowerCase()) {
      case 'year':
        timeBucket = moment().utc().subtract(1, 'year').toDate();
        aggregate = [
          {
            $addFields: {
              Month: { $month: '$time' },
            },
          },
          { $match: { time: { $gt: timeBucket } } },
          {
            $group: {
              _id: '$Month',
              device: { $last: '$device' },
              location: { $last: '$location' },
              temperature: { $last: '$temperature' },
              humidity: { $last: '$humidity' },
              connectivity: { $last: '$connectivity' },
              mode: { $last: '$mode' },
              ecoMode: { $last: '$ecoMode' },
              setPoint: { $last: '$setPoint' },
              hvac: { $last: '$hvac' },
            },
          },
          { $sort: { _id: 1 } },
        ];
        break;
      case 'month':
        timeBucket = moment().utc().subtract(1, 'month').toDate();
        aggregate = [
          {
            $addFields: {
              Day: { $dayOfMonth: '$time' },
            },
          },
          { $match: { time: { $gt: timeBucket } } },
          {
            $group: {
              _id: '$Day',
              device: { $last: '$device' },
              location: { $last: '$location' },
              temperature: { $last: '$temperature' },
              humidity: { $last: '$humidity' },
              connectivity: { $last: '$connectivity' },
              mode: { $last: '$mode' },
              ecoMode: { $last: '$ecoMode' },
              setPoint: { $last: '$setPoint' },
              hvac: { $last: '$hvac' },
            },
          },
          { $sort: { _id: 1 } },
        ];
        break;
      case 'week':
        timeBucket = moment().utc().subtract(1, 'week').toDate();
        aggregate = [
          {
            $addFields: {
              Day: { $dayOfMonth: '$time' },
              Hour: { $hour: '$time' },
            },
          },
          { $match: { time: { $gt: timeBucket } } },
          {
            $group: {
              _id: { Day: '$Day', Hour: '$Hour' },
              device: { $last: '$device' },
              location: { $last: '$location' },
              temperature: { $last: '$temperature' },
              humidity: { $last: '$humidity' },
              connectivity: { $last: '$connectivity' },
              mode: { $last: '$mode' },
              ecoMode: { $last: '$ecoMode' },
              setPoint: { $last: '$setPoint' },
              hvac: { $last: '$hvac' },
            },
          },
          { $sort: { _id: 1 } },
        ];
        break;
      case 'day':
        timeBucket = moment().utc().subtract(1, 'day').toDate();
        aggregate = [
          { $match: { time: { $gt: timeBucket } } },
          { $sort: { _id: 1 } },
        ];
        break;
      default:
        // Hour
        timeBucket = moment().utc().subtract(1, 'hour').toDate();
        aggregate = [
          { $match: { time: { $gt: timeBucket } } },
          { $sort: { _id: 1 } },
        ];
        break;
    }

    debug(`Connect to db`);
    dbConnection = await this._connectToDB();
    debug(`Query DB`);
    const results = await dbConnection
      .db(this.serviceNameSpace)
      .collection(this.serviceNameSpace)
      .aggregate(aggregate)
      .toArray();

    if (results.count === 0) {
      // Exit function as no data to process
      if (typeof res !== 'undefined' && res !== null) {
        this._sendResponse(res, next, 200, []);
      } else {
        return [];
      }
    }

    if (typeof res !== 'undefined' && res !== null) {
      this._sendResponse(res, next, 200, results);
    } else {
      return results;
    }
  } catch (err) {
    this.logger.error(`${this._traceStack()} - ${err.message}`);
    if (typeof res !== 'undefined' && res !== null) {
      this._sendResponse(res, next, 500, err);
    }
  } finally {
    try {
      debug(`Close DB connection`);
      await dbConnection.close();
    } catch (err) {
      debug('Not able to close DB');
    }
  }
  return true;
}

/**
 * @type get
 * @path /sensors/current
 */
async function _current(req, res, next) {
  debug(`Display Nest Thermostat latest readings API called`);
  let dbConnection;

  try {
    debug(`Connect to db`);
    dbConnection = await this._connectToDB();
    debug(`Query DB`);
    const lastHour = moment().utc().subtract(1, 'hour').toDate();
    const results = await dbConnection
      .db(this.serviceNameSpace)
      .collection(this.serviceNameSpace)
      .aggregate([
        { $match: { time: { $gt: lastHour } } },
        {
          $group: {
            _id: '$device',
            time: { $last: '$time' },
            device: { $last: '$device' },
            location: { $last: '$location' },
            temperature: { $last: '$temperature' },
            humidity: { $last: '$humidity' },
            connectivity: { $last: '$connectivity' },
            mode: { $last: '$mode' },
            ecoMode: { $last: '$ecoMode' },
            setPoint: { $last: '$setPoint' },
            hvac: { $last: '$hvac' },
          },
        },
      ])
      .toArray();

    if (results.count === 0) {
      // Exit function as no data to process
      if (typeof res !== 'undefined' && res !== null) {
        this._sendResponse(res, next, 200, []);
      } else {
        return [];
      }
    }

    // Add master eco mode to results
    const ecoModeOverride = await this._masterEcoMode.call(this);
    results[0].ecoModeOverride = ecoModeOverride;

    if (typeof res !== 'undefined' && res !== null) {
      this._sendResponse(res, next, 200, results);
    } else {
      return results;
    }
  } catch (err) {
    this.logger.error(`${this._traceStack()} - ${err.message}`);
    if (typeof res !== 'undefined' && res !== null) {
      this._sendResponse(res, next, 500, err);
    }
  } finally {
    try {
      debug(`Close DB connection`);
      await dbConnection.close();
    } catch (err) {
      debug('Not able to close DB');
    }
  }
  return true;
}

/**
 * @type put
 * @path /sensors/heating
 */
async function _heating(req, res, next) {
  this.logger.info('Changing Nest heating settings');

  const { heatTemperature } = req.params;
  let { ecoMode } = req.params;

  debug(`Check input params`);
  ecoMode = ecoMode ? 'MANUAL_ECO' : 'OFF';

  let setEcoMode = false;
  if (typeof ecoMode !== 'undefined' && ecoMode !== null) setEcoMode = true;
  let setHeating = false;
  if (typeof heatTemperature !== 'undefined' && heatTemperature !== null)
    setHeating = true;

  try {
    const oauth2Client = await this._nestLogin.call(this);

    debug(`Get nest thermostat device`);
    const projectID = await this._getVaultSecret('ProjectID');
    const smartdevicemanagement = await google.smartdevicemanagement('v1');
    let returnData = await smartdevicemanagement.enterprises.devices.list({
      auth: oauth2Client,
      parent: `enterprises/${projectID}`,
    });

    // Get device
    const devices = returnData.data.devices.filter(
      (device) => device.type === 'sdm.devices.types.THERMOSTAT',
    );
    if (devices.length === 0) {
      const err = new Error('No devices found');
      this.logger.error(`${this._traceStack()} - ${err.message}`);
      if (typeof res !== 'undefined' && res !== null) {
        this._sendResponse(res, next, 500, err);
      }
      return false;
    }
    const device = smartdevicemanagement.enterprises.devices;

    // Process eco mode changes
    if (setEcoMode) {
      const ecoModeCheck = ecoMode === 'OFF' ? 'OFF' : 'MANUAL_ECO';

      // Check if current mode is different
      if (
        devices[0].traits['sdm.devices.traits.ThermostatEco'].mode !==
        ecoModeCheck
      ) {
        debug(
          `Set Nest thermostat eco mode ${ecoMode === 'OFF' ? 'off' : 'on'}`,
        );

        returnData = await device.executeCommand({
          auth: oauth2Client,
          name: devices[0].name,
          requestBody: {
            command: 'sdm.devices.commands.ThermostatEco.SetMode',
            params: {
              mode: ecoMode,
            },
          },
        });

        if (this._isEmptyObject(returnData.data)) {
          this.logger.info(
            `Turned Nest thermostat eco mode ${
              ecoMode === 'OFF' ? 'off' : 'on'
            }`,
          );
        } else {
          const err = new Error(
            `Update Nest thermostat failed: ${returnData.data.error.message}`,
          );
          this.logger.error(`${this._traceStack()} - ${err.message}`);
          if (typeof res !== 'undefined' && res !== null) {
            this._sendResponse(res, next, 500, err);
          }
          return false;
        }
      } else {
        debug(`Nest thermostat eco mode is unchanged`);
      }

      if (!setHeating) {
        if (typeof res !== 'undefined' && res !== null) {
          this._sendResponse(res, next, 200, { state: 'saved' });
        }
        return true;
      }
    }

    // Process heating temp changes
    if (
      setHeating &&
      devices[0].traits['sdm.devices.traits.ThermostatEco'].mode === 'OFF'
    ) {
      if (typeof heatTemperature !== 'number') {
        const err = new Error(
          'Thermostat temperature set point was not a number',
        );
        this.logger.error(`${this._traceStack()} - ${err.message}`);
        if (typeof res !== 'undefined' && res !== null) {
          this._sendResponse(res, next, 500, err);
        }
        return false;
      }

      debug(`Set Nest thermostat temperature to ${heatTemperature}`);

      returnData = await device.executeCommand({
        auth: oauth2Client,
        name: devices[0].name,
        requestBody: {
          command: 'sdm.devices.commands.ThermostatTemperatureSetpoint.SetHeat',
          params: {
            heatCelsius: heatTemperature,
          },
        },
      });

      if (this._isEmptyObject(returnData.data)) {
        this.logger.info(
          `Turned Nest thermostat temperature to ${heatTemperature}`,
        );
      } else {
        const err = new Error(
          `Update Nest thermostat failed: ${returnData.data.error.message}`,
        );
        this.logger.error(`${this._traceStack()} - ${err.message}`);
        if (typeof res !== 'undefined' && res !== null) {
          this._sendResponse(res, next, 500, err);
        }
        return false;
      }

      if (typeof res !== 'undefined' && res !== null) {
        this._sendResponse(res, next, 200, { state: 'saved' });
      }
    } else {
      debug(`Nest thermostat in eco mode, temp not set`);
      if (typeof res !== 'undefined' && res !== null) {
        this._sendResponse(res, next, 200, { state: 'Nothing to update' });
      }
    }
    return true;
  } catch (err) {
    this.logger.error(`${this._traceStack()} - ${err.message}`);
    if (typeof res !== 'undefined' && res !== null) {
      this._sendResponse(res, next, 500, err);
    }
  }
  return true;
}

export default {
  _sensors,
  _current,
  _heating,
};
