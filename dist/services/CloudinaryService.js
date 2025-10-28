"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CloudinaryService = void 0;
const crypto_1 = __importDefault(require("crypto"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
class CloudinaryService {
    constructor() {
        this.cloudName = process.env.CLOUDINARY_CLOUD_NAME || '';
        this.apiKey = process.env.CLOUDINARY_API_KEY || '';
        this.apiSecret = process.env.CLOUDINARY_API_SECRET || '';
        if (!this.cloudName || !this.apiKey || !this.apiSecret) {
            throw new Error('Cloudinary credentials not found in environment variables');
        }
    }
    /**
     * Generate upload signature for direct client-side uploads
     * @param folder - Optional folder path for organization
     * @returns Upload signature data for frontend
     */
    generateUploadSignature(folder = 'quiz-funnel') {
        try {
            const timestamp = Math.round(Date.now() / 1000);
            const params = {
                timestamp,
                folder,
                ...(folder && { folder })
            };
            // Create signature string
            const signatureString = Object.keys(params)
                .sort()
                .map(key => `${key}=${params[key]}`)
                .join('&');
            // Generate signature
            const signature = crypto_1.default
                .createHash('sha1')
                .update(signatureString + this.apiSecret)
                .digest('hex');
            console.log('✅ Cloudinary upload signature generated');
            return {
                timestamp,
                signature,
                api_key: this.apiKey,
                cloud_name: this.cloudName,
                folder
            };
        }
        catch (error) {
            console.error('❌ Error generating Cloudinary upload signature:', error);
            throw new Error('Failed to generate upload signature');
        }
    }
    /**
     * Validate Cloudinary URL format
     * @param url - URL to validate
     * @returns boolean indicating if URL is valid Cloudinary URL
     */
    isValidCloudinaryUrl(url) {
        const cloudinaryUrlPattern = /^https:\/\/res\.cloudinary\.com\/[^\/]+\/image\/upload\/.*$/;
        return cloudinaryUrlPattern.test(url);
    }
}
exports.CloudinaryService = CloudinaryService;
//# sourceMappingURL=CloudinaryService.js.map