/**
 * Import libraries
 */
// eslint-disable-next-line import/no-unresolved
import { setTimeout } from 'timers/promises';
import { google } from 'googleapis';
import DebugModule from 'debug';

const debug = new DebugModule('Nest:DataCollector');
const devicePollingIntival = 15 * 60 * 1000; // 15 minutes

async function _nestLogin() {
  debug(`Get access tokens from vault`);

  const clientID = await this._getVaultSecret('ClientID');
  const clientSecret = await this._getVaultSecret('ClientSecret');
  let nestTokens = await this._getVaultSecret('NestTokens');
  nestTokens = JSON.parse(nestTokens);

  debug(`Create oAuth Client`);
  const oauth2Client = new google.auth.OAuth2(
    clientID,
    clientSecret,
    'https://www.google.com',
  );

  debug(`Bind token to oAuth client`);
  oauth2Client.setCredentials(nestTokens);

  oauth2Client.on('tokens', (tokens) => {
    if (tokens.refresh_token) {
      this.logger.info(`New token generated: ${tokens.refresh_token}`);
      this._updateVaultSecret.call(
        this,
        'NestTokens',
        oauth2Client.credentials,
      );
    }
  });
  return oauth2Client;
}

/**
 * List schedules
 */
async function _listSchedules() {
  debug(`List schedules`);

  let dbConnection;

  try {
    debug(`Connect to db`);
    dbConnection = await this._connectToDB();
    debug(`Query DB`);
    const query = {};
    const results = await dbConnection
      .db(this.serviceNameSpace)
      .collection('schedules')
      .find(query)
      .toArray();

    if (results.count === 0) {
      // Exit function as no data to process
      return [];
    }

    return results;
  } catch (err) {
    this.logger.error(`${this._traceStack()} - ${err.message}`);
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
 * Does heating need to be on or off
 */
async function _needsHeating(deviceData) {

  debug(`Check if heating needs to be turned on or off`);

  const { ecoMode, dayTemperature, nightTemperature } = await this._masterEcoMode.call(this);

  // Check if master eco mode is on, if so skip
  if (ecoMode) {
    debug('Master eco mode on, skip heating check');
    if (deviceData.ecoMode === 'MANUAL_ECO') {
      debug('Already in eco mode');
    } else {
      debug('Put device into eco mode');
      const req = { params: { ecoMode: true }};
      await this._heating.call(this, req, null, null);
    }
    return true;
  }

  // Check if on holiday
  /*
  if (await this._onHolidayToday()) {
    debug('On holiday');

    if (deviceData.ecoMode === 'MANUAL_ECO') {
      debug('Already in eco mode');
    } else {
      debug('Put house into eco mode');
      const req = { params: { ecoMode: true }};
      await this._heating.call(this, req, null, null);
    }
    return true;
  }

  // Set night time temp
  if (hour >= 10 && hour <= 6) {
    debug('Lower temp set point overnight');
    const req = { params: { heatTemperature: nightTemperature }};
    await this._heating.call(this, req, null, null);
    return true;
  } 

  // Day time temp setting

  // Check if at home
  if (!await this._atHomeToday()) {
    debug('Not at home today');
    
    // If time is between 9 and 3 then put into eco mode
    const timeNow = new Date();
    const hour = timeNow.getHours();
    
    if (hour >= 9 && hour <= 15) {
      if (deviceData.ecoMode === 'MANUAL_ECO') {
        debug('Already in eco mode');
      } else {
        debug('Put device into eco mode');
        const req = { params: { ecoMode: true }};
        await this._heating.call(this, req, null, null);
      }
      return true;
    } 
  }

  // Get house temp
  let houseTemp = await this._callAlfredServiceGet.call(
    this,
    `${process.env.ALFRED_NETATMO_SERVICE}/sensors/current`,
  );
  houseTemp = houseTemp.filter((devices) => devices.location != ['Garden']);
  if (houseTemp.length === 0) {
    this.logger.error('No recent house temp found');
    return false
  }

  // Get min temp
  const minTemp = Math.floor(Math.min.apply(Math, houseTemp.map(function(item) { return item.temperature })));

  let ecoMode = false;
  if (minTemp < masterTemperature) {
    debug(`Temp in house (${minTemp}°C) is colder than min setting`);

    // Make sure eco mode is off, to heat house
    if (deviceData.ecoMode === 'OFF') {
      debug('Heating already on')
      return;
    }
  } else {
    debug('Temp in house is warmer than min setting');
    ecoMode = true;

    // Check if eco mode is on
    if (deviceData.ecoMode === 'MANUAL_ECO') {
      debug('Eco mode on')
      return;
    }
  }

  const req = { params: { heatTemperature: masterTemperature, ecoMode: ecoMode }};
  await this._heating.call(this, req, null, null);
  */
}

/**
 * Process nest data
 */
async function _processNestData(device) {
  let deviceJSON = {};

  debug(`Getting data from device`);

  if (device.type !== 'sdm.devices.types.THERMOSTAT') {
    debug(`Device is not a Thermostat`);
    return false;
  }

  deviceJSON = {
    time: new Date(),
    device: device.type,
    location: device.parentRelations[0].displayName,
    temperature:
      device.traits['sdm.devices.traits.Temperature'].ambientTemperatureCelsius,
    humidity:
      device.traits['sdm.devices.traits.Humidity'].ambientHumidityPercent,
    connectivity: device.traits['sdm.devices.traits.Connectivity'].status,
    mode: device.traits['sdm.devices.traits.ThermostatMode'].mode,
    ecoMode: device.traits['sdm.devices.traits.ThermostatEco'].mode,
    setPoint:
      device.traits['sdm.devices.traits.ThermostatTemperatureSetpoint']
        .heatCelsius,
    hvac: device.traits['sdm.devices.traits.ThermostatHvac'].status,
  };

  debug(`Saving data: ${deviceJSON.device}`);
  const dbConnection = await this._connectToDB();
  debug(`Insert data`);
  const results = await dbConnection
    .db(this.serviceNameSpace)
    .collection(this.serviceNameSpace)
    .insertOne(deviceJSON);

  if (results.acknowledged)
    this.logger.info(`Saved data: ${deviceJSON.device}`);
  else
    this.logger.error(
      `${this._traceStack()} - Failed to save data: ${deviceJSON.device}`,
    );
  debug(`Close DB connection`);
  await dbConnection.close();

  _needsHeating.call(this, deviceJSON);

  return true;
}

/**
 * Get data from Nest devices
 */
async function _getNestData(calledFromAPI) {
  try {
    const oauth2Client = await _nestLogin.call(this);

    debug(`Get nest devices`);
    const projectID = await this._getVaultSecret('ProjectID');
    const smartdevicemanagement = google.smartdevicemanagement('v1');
    const returnData = await smartdevicemanagement.enterprises.devices.list({
      auth: oauth2Client,
      parent: `enterprises/${projectID}`,
    });

    // Process device data
    const { devices } = returnData.data;

    // eslint-disable-next-line no-restricted-syntax
    for (const device of devices) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await _processNestData.call(this, device);
      } catch (err) {
        this.logger.error(`${this._traceStack()} - ${err.message}`);
      }
    }

    // Setup polling
    if (!calledFromAPI) {
      await setTimeout(devicePollingIntival);
      _getNestData.call(this);
    }
    return true;
  } catch (err) {
    this.logger.error(`${this._traceStack()} - ${err.message}`);
    return err;
  }
}

export default {
  _listSchedules,
  _nestLogin,
  _getNestData,
};
