const headers = (req, res, next) => {
  res.header("Access-Control-Allow-Origin", "http://localhost:3000"); // replace with your domain
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept"
  );
  next();
};

module.exports = headers