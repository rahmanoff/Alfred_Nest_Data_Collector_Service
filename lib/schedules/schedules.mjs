/**
 * Import external libraries
 */
import DebugModule from 'debug';

const debug = new DebugModule('Nest:Schedules');

/**
 * Set heating
 */
const cosyOutsideTemp = 17;

async function _setHeating(data) {
  debug(`Running heating schedule: ${data.name}`);

  try {
    const req = {
      params: {
        ecoMode: data.ecoMode,
        heatTemperature: data.temperature,
      },
    };

    debug(`Checking today's temp`);
    const weatherToday = await this._callAlfredServiceGet.call(
      this,
      `${process.env.ALFRED_WEATHER_SERVICE}/today`,
    );

    if (!(weatherToday instanceof Error)) {
      const baseMsg = `Today's high will be ${weatherToday.temperatureHigh},`;

      // If too cold keep heating on
      if (weatherToday.temperatureHigh < cosyOutsideTemp && data.ecoMode) {
        this.logger.info(`${baseMsg} so will keep heating on`);
        return;
      }

      // If too warn keep eco mode on
      if (weatherToday.temperatureHigh >= cosyOutsideTemp && !data.ecoMode) {
        this.logger.info(`${baseMsg} so will keep eco mode on`);
        return;
      }
    }

    await this._heating.call(this, req);
  } catch (err) {
    this.logger.error(`${this._traceStack()} - ${err.message}`);
  }
}

/**
 * Set up heating schedule
 */
async function _setupSchedule(data) {
  debug(`Create heating timer from ${data.name} schedule`);

  if (data.hour === null || data.minute === null) {
    this.logger.error(`${this._traceStack()} - Schedule values were null`);
    return false;
  }

  debug('Check if on holiday');
  if (await this._onHolidayToday()) {
    this.logger.info('On holiday, override schedule. Set eco mode on');
    // eslint-disable-next-line no-param-reassign
    data.ecoMode = true;
  } else if (data.override) {
    debug('Check if girls at home');
    if (
      data.name.includes('Return from school') &&
      !(await this._kidsAtHomeToday())
    ) {
      this.logger.info(`Kids not at home, skipping schedule: ${data.name}`);
      return false;
    }
  }

  debug(`Register heating schedule`);
  this.schedules.push({
    hour: data.hour,
    minute: data.minute,
    description: data.name,
    functionToCall: _setHeating,
    args: data,
  });

  return true;
}

/**
 * Set up heating schedules
 */
async function setupSchedules() {
  debug(`Setting up Schedules`);

  let results;
  try {
    results = await this._listSchedules.call(this, null, null, null);
  } catch (err) {
    this.logger.error(`${this._traceStack()} - ${err.message}`);
    return;
  }

  // If master eco mode true do not set schedules
  try {
    const masterRecord = results.filter((schedule) => schedule.schedule === 0);
    let ecoMode = false;
    try {
      ecoMode = masterRecord[0].ecoMode;
    } catch {
      debug('Master eco mode is missing from data');
    }

    if (ecoMode) {
      this.logger.info(`Master eco mode active, skipping schedule setup`);
      return;
    }
    debug('Master eco mode not active');
  } catch (err) {
    this.logger.error(`${this._traceStack()} - ${err.message}`);
    return;
  }

  // Filter for only active schedules
  results = results.filter(
    (schedule) => schedule.active && schedule.schedule > 0,
  );

  // Setup schedules
  await Promise.all(
    results.map(async (schedule) => {
      await _setupSchedule.call(this, schedule);
    }),
  );

  // Activate schedules
  await this.activateSchedules();
}

export default {
  setupSchedules,
};
