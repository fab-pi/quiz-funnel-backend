/**
 * URL Validation Utility
 * Validates image URLs from multiple sources (Cloudinary, Shopify CDN, etc.)
 */

/**
 * Validate if a URL is a valid image URL from supported sources
 * @param url - URL to validate
 * @returns boolean indicating if URL is valid
 */
export function isValidImageUrl(url: string): boolean {
  if (!url || typeof url !== 'string') {
    return false;
  }

  // Cloudinary URL pattern
  // Example: https://res.cloudinary.com/cloudname/image/upload/v1234567890/path/to/image.jpg
  const cloudinaryPattern = /^https:\/\/res\.cloudinary\.com\/[^\/]+\/image\/upload\/.*$/;

  // Shopify CDN URL pattern
  // Example: https://cdn.shopify.com/s/files/1/1234/5678/files/image.jpg
  // Or: https://cdn.shopify.com/s/files/1/1234/5678/image.jpg?v=1234567890
  const shopifyPattern = /^https:\/\/cdn\.shopify\.com\/s\/files\/1\/.*$/;

  return cloudinaryPattern.test(url) || shopifyPattern.test(url);
}

/**
 * Check if a URL is a Cloudinary URL
 * @param url - URL to check
 * @returns boolean indicating if URL is from Cloudinary
 */
export function isCloudinaryUrl(url: string): boolean {
  if (!url || typeof url !== 'string') {
    return false;
  }
  const cloudinaryPattern = /^https:\/\/res\.cloudinary\.com\/[^\/]+\/image\/upload\/.*$/;
  return cloudinaryPattern.test(url);
}

/**
 * Check if a URL is a Shopify CDN URL
 * @param url - URL to check
 * @returns boolean indicating if URL is from Shopify CDN
 */
export function isShopifyUrl(url: string): boolean {
  if (!url || typeof url !== 'string') {
    return false;
  }
  const shopifyPattern = /^https:\/\/cdn\.shopify\.com\/s\/files\/1\/.*$/;
  return shopifyPattern.test(url);
}

