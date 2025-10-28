"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const CloudinaryService_1 = require("../services/CloudinaryService");
const router = (0, express_1.Router)();
const cloudinaryService = new CloudinaryService_1.CloudinaryService();
// GET /api/upload/signature - Generate upload signature for direct client uploads
router.get('/upload/signature', async (req, res) => {
    try {
        console.log('📤 Generating Cloudinary upload signature...');
        const { folder } = req.query;
        const uploadSignature = cloudinaryService.generateUploadSignature(folder || 'quiz-funnel');
        res.json({
            success: true,
            data: uploadSignature
        });
    }
    catch (error) {
        console.error('❌ Error generating upload signature:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to generate upload signature'
        });
    }
});
exports.default = router;
//# sourceMappingURL=upload.js.map