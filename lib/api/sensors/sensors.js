/**
 * Import external libraries
 */
const moment = require('moment');
const { google } = require('googleapis');
const helper = require('alfred-helper');

/**
 * @type get
 * @path /sensors
 */
async function _sensors(req, res, next) {
  this.logger.debug(
    `${this._traceStack()} - Display Nest Thermostat data API called`,
  );

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

    this.logger.trace(`${this._traceStack()} - Connect to db`);
    dbConnection = await this._connectToDB();
    this.logger.trace(`${this._traceStack()} - Execute query`);
    const results = await dbConnection
      .db(this.namespace)
      .collection(this.namespace)
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
    this.logger.trace(`${this._traceStack()} - Close DB connection`);
    await dbConnection.close();
  }
  return true;
}

/**
 * @type get
 * @path /sensors/current
 */
async function _current(req, res, next) {
  this.logger.debug(
    `${this._traceStack()} - Display Nest Thermostat latest readings API called`,
  );
  let dbConnection;

  // Get latest readings from device
  await this._getNestData.call(this, true);

  try {
    this.logger.trace(`${this._traceStack()} - Connect to db`);
    dbConnection = await this._connectToDB();
    this.logger.trace(`${this._traceStack()} - Execute query`);
    const lastHour = moment().utc().subtract(1, 'hour').toDate();
    const results = await dbConnection
      .db(this.namespace)
      .collection(this.namespace)
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
    this.logger.trace(`${this._traceStack()} - Close DB connection`);
    await dbConnection.close();
  }
  return true;
}

/**
 * @type put
 * @path /sensors/heating
 */
async function _heating(req, res, next) {
  this.logger.debug(
    `${this._traceStack()} - Change Nest heating settings API called`,
  );

  let { ecoMode, heatTemperature } = req.params;

  this.logger.debug(`${this._traceStack()} - Checking input params`);
  ecoMode = ecoMode ? 'MANUAL_ECO' : 'OFF';
  if (typeof heatTemperature !== 'number') heatTemperature = null;

  try {
    const oauth2Client = await this._nestLogin.call(this);

    this.logger.trace(`${this._traceStack()} - Get nest thermostat device`);
    const projectID = await this._getVaultSecret('ProjectID');
    const smartdevicemanagement = google.smartdevicemanagement('v1');
    let returnData = await smartdevicemanagement.enterprises.devices.list({
      auth: oauth2Client,
      parent: `enterprises/${projectID}`,
    });

    const devices = returnData.data.devices.filter(
      (device) => device.type === 'sdm.devices.types.THERMOSTAT',
    );

    this.logger.debug(
      `${this._traceStack()} - Set Nest thermostat eco mode ${
        ecoMode === 'OFF' ? 'off' : 'on'
      }`,
    );
    returnData = await smartdevicemanagement.enterprises.devices.executeCommand(
      {
        auth: oauth2Client,
        name: devices[0].name,
        requestBody: {
          command: 'sdm.devices.commands.ThermostatEco.SetMode',
          params: {
            mode: ecoMode,
          },
        },
      },
    );

    if (helper.isEmptyObject(returnData.data)) {
      this.logger.info(
        `Turned Nest thermostat eco mode ${ecoMode === 'OFF' ? 'off' : 'on'}`,
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

    if (heatTemperature !== null) {
      this.logger.debug(
        `${this._traceStack()} - Set Nest thermostat temperature to ${heatTemperature}`,
      );
      // eslint-disable-next-line max-len
      returnData = await smartdevicemanagement.enterprises.devices.executeCommand(
        {
          auth: oauth2Client,
          name: devices[0].name,
          requestBody: {
            command:
              'sdm.devices.commands.ThermostatTemperatureSetpoint.SetHeat',
            params: {
              heatCelsius: heatTemperature,
            },
          },
        },
      );

      if (helper.isEmptyObject(returnData.data)) {
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
    }

    if (typeof res !== 'undefined' && res !== null) {
      this._sendResponse(res, next, 200, { state: 'saved' });
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

module.exports = {
  _sensors,
  _current,
  _heating,
};
