module.exports = (req, res, next) => {
  const requestedId = req.params.id;
  const tokenSchoolId = req.user?.school_id;

  if (!requestedId || !tokenSchoolId) {
    return res.status(403).json({ error: 'School access denied' });
  }

  if (tokenSchoolId !== requestedId) {
    return res.status(403).json({ error: 'Access denied — you can only access your own school' });
  }

  next();
};
