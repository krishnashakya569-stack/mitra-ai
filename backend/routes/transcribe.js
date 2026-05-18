const express = require('express');
const router = express.Router();
const { upload, transcribeAudio } = require('../controllers/transcribeController');

router.post('/', upload.single('audio'), transcribeAudio);

module.exports = router;
