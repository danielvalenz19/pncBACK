const Joi = require('joi');
const { registerDevice, deleteDevice } = require('../models/deviceModel');

const regSchema = Joi.object({
  platform: Joi.string().valid('android', 'ios').required(),
  fcm_token: Joi.string().min(10).required()
});

async function register(req, res, next) {
  try {
    const { value, error } = regSchema.validate(req.body);
    if (error) return res.status(400).json({ error: 'BadRequest', message: error.message });

    const id = await registerDevice({
      userId: req.user.user_id,
      platform: value.platform,
      fcmToken: value.fcm_token
    });
    res.status(201).json({ device_id: id });
  } catch (e) { next(e); }
}

async function remove(req, res, next) {
  try {
    const ok = await deleteDevice({ userId: req.user.user_id, deviceId: Number(req.params.deviceId) });
    if (!ok) return res.status(404).json({ error: 'NotFound', message: 'Dispositivo no existe' });
    res.status(204).end();
  } catch (e) { next(e); }
}

module.exports = { register, remove };
