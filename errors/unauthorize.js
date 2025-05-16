const {StatusCodes} = require('http-status-codes')
const CustomAPI = require('./custom-api')

class UnAuthorize extends CustomAPI {
    constructor(message) {
        super (message);
        this.statusCode = StatusCodes.FORBIDDEN
    }
}

module.exports = UnAuthorize