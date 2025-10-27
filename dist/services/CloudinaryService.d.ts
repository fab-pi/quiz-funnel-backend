export declare class CloudinaryService {
    private cloudName;
    private apiKey;
    private apiSecret;
    constructor();
    /**
     * Generate upload signature for direct client-side uploads
     * @param folder - Optional folder path for organization
     * @returns Upload signature data for frontend
     */
    generateUploadSignature(folder?: string): {
        timestamp: number;
        signature: string;
        api_key: string;
        cloud_name: string;
        folder: string;
    };
    /**
     * Validate Cloudinary URL format
     * @param url - URL to validate
     * @returns boolean indicating if URL is valid Cloudinary URL
     */
    isValidCloudinaryUrl(url: string): boolean;
}
//# sourceMappingURL=CloudinaryService.d.ts.map