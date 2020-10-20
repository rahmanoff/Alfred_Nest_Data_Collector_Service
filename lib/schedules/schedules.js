async function setHeating(data) {
  this.logger.info(`Running heating schedule: ${data.name}`);

  try {
    const req = { params: { ecoMode: data.ecoMode } };

    const updateHeating = await this._heating.call(this, req);
    if (updateHeating instanceof Error) {
      this.logger.error(`${this._traceStack()} - ${updateHeating.message}`);
    }

    if (updateHeating instanceof Error) {
      throw new Error(
        `There was an error setting the heating for schedule: ${data.name}`,
      );
    }
  } catch (err) {
    this.logger.error(`${this._traceStack()} - ${err.message}`);
  }
}

async function setupSchedule(data) {
  this.logger.trace(
    `${this._traceStack()} - Create heating timer from ${data.name} schedule`,
  );

  if (data.hour === null || data.minute === null) {
    this.logger.error(`${this._traceStack()} - Schedule values were null`);
    return false;
  }

  this.logger.trace(`${this._traceStack()} - Register heating schedule`);
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
  // Setup heating schedules
  this.logger.trace(`${this._traceStack()} - Setting up Schedules`);

  try {
    let results = await this._listSchedules.call(this, null, null, null);
    if (results instanceof Error) {
      this.logger.error(`${this._traceStack()} - ${results.message}`);
    }
    // Filter for only active schedules
    results = results.filter((schedule) => schedule.active);

    // Setup schedules
    await Promise.all(
      results.map(async (schedule) => {
        await setupSchedule.call(this, schedule);
      }),
    );
    return true;
  } catch (err) {
    this.logger.error(`${this._traceStack()} - ${err.message}`);
  }
  return true;
}

module.exports = {
  setupSchedules,
};
