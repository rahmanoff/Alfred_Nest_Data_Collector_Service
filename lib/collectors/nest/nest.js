/**
 * Import libraries
 */
const { google } = require('googleapis');
const debug = require('debug')('Nest:DataCollector');

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
    .db(this.namespace)
    .collection(this.namespace)
    .insertOne(deviceJSON);

  if (results.insertedCount === 1)
    this.logger.info(`Saved data: ${deviceJSON.device}`);
  else
    this.logger.error(
      `${this._traceStack()} - Failed to save data: ${deviceJSON.device}`,
    );
  debug(`Close DB connection`);
  await dbConnection.close();
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
      setTimeout(() => {
        _getNestData.call(this);
      }, devicePollingIntival);
    }
    return true;
  } catch (err) {
    this.logger.error(`${this._traceStack()} - ${err}`);
    return err;
  }
}

module.exports = {
  _nestLogin,
  _getNestData,
};
