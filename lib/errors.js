class VviLogCliError extends Error {
  constructor(message) {
    super(message);
    this.name = "VviLogCliError";
  }
}

module.exports = {
  VviLogCliError,
};
