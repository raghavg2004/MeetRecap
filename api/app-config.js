module.exports = (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    apiBaseUrl: process.env.BACKEND_ORIGIN || '',
    socketUrl: process.env.SOCKET_ORIGIN || process.env.BACKEND_ORIGIN || '',
    appName: 'MeetRecap',
  });
};
