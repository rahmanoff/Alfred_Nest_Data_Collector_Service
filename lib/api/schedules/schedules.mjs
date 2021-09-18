/**
 * Import helper libraries
 */
import DebugModule from 'debug';
import { createRequire } from 'module';

/**
 * Import internal libraries
 */
const require = createRequire(import.meta.url); // construct the require method
const scheduleSchema = require('../../schemas/schedule.json');

const debug = new DebugModule('Nest:API_Schedules');

/**
 * @type get
 * @path /masterEcoMode
 */
async function _masterEcoMode(req, res, next) {
  debug(`Master eco mode API called`);

  try {
    const results = await this._listSchedules.call(this, null, null, null);
    const masterRecord = results.filter((schedule) => schedule.schedule === 0);

    let ecoMode = false;
    try {
      ecoMode = masterRecord[0].ecoMode;
    } catch {
      throw new Error('Master eco mode is missing from data');
    }

    if (typeof res !== 'undefined' && res !== null) {
      this._sendResponse(res, next, 200, { ecoMode });
    }
    return ecoMode;
  } catch (err) {
    this.logger.error(`${this._traceStack()} - ${err.message}`);
    if (typeof res !== 'undefined' && res !== null) {
      this._sendResponse(res, next, 500, err);
    }
    return err;
  }
}

/**
 * @type get
 * @path /schedules
 */
async function _listSchedules(req, res, next) {
  debug(`List schedules API called`);

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
 * @path /schedules/:scheduleID
 */
async function _listSchedule(req, res, next) {
  debug(`Display schedule API called`);

  const { scheduleID } = req.params;

  let dbConnection;

  try {
    debug(`Connect to db`);
    dbConnection = await this._connectToDB();
    debug(`Query DB`);
    const query = { schedule: Number(scheduleID) };
    const results = await dbConnection
      .db(this.serviceNameSpace)
      .collection('schedules')
      .find(query)
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
 * @type put
 * @path /schedules/:scheduleID
 */
async function _saveSchedule(req, res, next) {
  debug(`Update schedule API called`);

  const { scheduleID, name, hour, minute, ecoMode, override, active } =
    req.params;

  let dbConnection;

  try {
    debug(`Check for valid params`);
    const validSchema = this._validateSchema(req, scheduleSchema);
    if (validSchema !== true) {
      if (typeof res !== 'undefined' && res !== null) {
        this._sendResponse(res, next, 400, validSchema);
      }
      return validSchema;
    }

    debug(`Read existing values`);
    const scheduleData = await _listSchedule.call(
      this,
      { params: { scheduleID } },
      null,
      null,
    );
    if (scheduleData instanceof Error) {
      this.logger.error(`${this._traceStack()} - ${scheduleData.message}`);
      if (typeof res !== 'undefined' && res !== null) {
        this._sendResponse(res, next, 500, scheduleData);
      }
      return scheduleData;
    }

    debug(`Update values from params`);
    if (typeof name !== 'undefined' && name !== null)
      scheduleData[0].name = name;
    if (typeof hour !== 'undefined' && hour !== null)
      scheduleData[0].hour = hour;
    if (typeof minute !== 'undefined' && minute !== null)
      scheduleData[0].minute = minute;
    if (typeof override !== 'undefined' && override !== null)
      scheduleData[0].override = override;
    if (typeof active !== 'undefined' && active !== null)
      scheduleData[0].active = active;
    if (typeof ecoMode !== 'undefined' && ecoMode !== null)
      scheduleData[0].ecoMode = ecoMode;

    debug(`Update db`);

    const query = { _id: scheduleData[0]._id };
    const body = { $set: scheduleData[0] };
    const opts = {
      returnOriginal: false,
      upsert: true,
    };

    dbConnection = await this._connectToDB();
    debug(`Query DB`);
    const results = await dbConnection
      .db(this.serviceNameSpace)
      .collection('schedules')
      .findOneAndUpdate(query, body, opts);

    // Send data back to caler
    if (results.ok === 1) {
      debug(`Saved schedule data: ${JSON.stringify(req.params)}`);
      if (typeof res !== 'undefined' && res !== null) {
        this._sendResponse(res, next, 200, { state: 'saved' });
      }

      debug(`Reseting schedules due to save event`);
      // Re-set schedule
      await this.setupSchedules.call(this);
      await this.activateSchedules.call(this);
      return true;
    }

    if (typeof res !== 'undefined' && res !== null) {
      const err = new Error('Failed to save');
      this.logger.error(`${this._traceStack()} - ${err.message}`);
      this._sendResponse(res, next, 500, err);
      return err;
    }
    return true;
  } catch (err) {
    this.logger.error(`${this._traceStack()} - ${err.message}`);
    if (typeof res !== 'undefined' && res !== null) {
      this._sendResponse(res, next, 500, err);
    }
    return err;
  } finally {
    try {
      debug(`Close DB connection`);
      await dbConnection.close();
    } catch (err) {
      debug('Not able to close DB');
    }
  }
}

export default {
  _masterEcoMode,
  _listSchedules,
  _listSchedule,
  _saveSchedule,
};
