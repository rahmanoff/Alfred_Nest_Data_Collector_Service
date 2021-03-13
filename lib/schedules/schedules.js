/**
 * Import external libraries
 */
const debug = require('debug')('Nest:Schedules');

/**
 * Set heating
 */
async function setHeating(data) {
  debug(`Running heating schedule: ${data.name}`);

  const req = {
    params: {
      ecoMode: data.ecoMode,
      heatTemperature: data.temperature,
    },
  };

  try {
    await this._heating.call(this, req);
  } catch (err) {
    this.logger.error(`${this._traceStack()} - ${err.message}`);
  }
}

/**
 * Set up heating schedule
 */
async function setupSchedule(data) {
  debug(`Create heating timer from ${data.name} schedule`);

  if (data.hour === null || data.minute === null) {
    this.logger.error(`${this._traceStack()} - Schedule values were null`);
    return false;
  }

  if (data.override) {
    debug('Check if at home');
    if ((await this._atHomeToday()) && !(await this._onHolidayToday())) {
      this.logger.info(`At home, skipping schedule: ${data.name}`);
      return;
    }

    debug('Check if girls at home');
    if (
      data.name.includes('Return from school') &&
      !(await this._kidsAtHomeToday())
    ) {
      this.logger.info(`Kids not at home, skipping schedule: ${data.name}`);
      return;
    }
  }

  debug(`Register heating schedule`);
  this.schedules.push({
    hour: data.hour,
    minute: data.minute,
    description: data.name,
    functionToCall: setHeating,
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
    masterRecord = results.filter((schedule) => schedule.schedule === 0);
    if (masterRecord[0].ecoMode) {
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
      await setupSchedule.call(this, schedule);
    }),
  );

  // Activate schedules
  await this.activateSchedules();
}

module.exports = {
  setupSchedules,
};
