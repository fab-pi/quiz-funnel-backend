import { Router, Response } from 'express';
import { QuizCreationService } from '../services/QuizCreationService';
import { AdminService } from '../services/AdminService';
import { CloudinaryService } from '../services/CloudinaryService';
import { ShopifyService } from '../services/shopify/ShopifyService';
import pool from '../config/db';
import { QuizCreationRequest } from '../types';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import { promisify } from 'util';
import dns from 'dns';
import { facebookPixelService } from '../services/FacebookPixelService';

const router = Router();

// Initialize ShopifyService (may fail if env vars not set, but that's OK for native users)
let shopifyService: ShopifyService | null = null;
try {
  shopifyService = new ShopifyService(pool);
} catch (error) {
  console.warn('⚠️ ShopifyService not initialized (Shopify features disabled):', (error as Error).message);
}

const quizCreationService = new QuizCreationService(pool, shopifyService || undefined);
const adminService = new AdminService(pool);
const cloudinaryService = new CloudinaryService();

/**
 * Validate domain format
 * @param domain - Domain string to validate
 * @returns Object with isValid boolean and optional error message
 */
function validateDomain(domain: string | null | undefined): { isValid: boolean; error?: string } {
  if (!domain || domain.trim().length === 0) {
    return { isValid: true }; // Empty is valid (optional field)
  }

  const normalized = domain.toLowerCase().trim();
  
  // Remove http:// or https:// if present
  const cleaned = normalized.replace(/^https?:\/\//, '');
  
  // Remove trailing slash
  const finalDomain = cleaned.replace(/\/$/, '');
  
  // Basic domain validation regex
  // Allows: subdomain.domain.tld format
  const domainRegex = /^([a-z0-9]([a-z0-9\-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;
  
  if (!domainRegex.test(finalDomain)) {
    return {
      isValid: false,
      error: 'Invalid domain format. Use format like: shop.brandx.com'
    };
  }

  // Check for paths (not allowed)
  if (finalDomain.includes('/')) {
    return {
      isValid: false,
      error: 'Domain should not include paths. Use format like: shop.brandx.com'
    };
  }

  // Check for query parameters (not allowed)
  if (finalDomain.includes('?')) {
    return {
      isValid: false,
      error: 'Domain should not include query parameters. Use format like: shop.brandx.com'
    };
  }

  return { isValid: true };
}

// DNS resolution promises
const resolveCname = promisify(dns.resolveCname);
const resolve4 = promisify(dns.resolve4);

// Debug: Log route definitions
console.log('🔧 Defining admin routes:');
console.log('  - POST /admin/quiz');
console.log('  - PUT /admin/quiz/:quizId');
console.log('  - GET /admin/quiz/:quizId');
console.log('  - GET /admin/quiz/:quizId/dns-instructions');
console.log('  - GET /admin/quiz/:quizId/verify-domain');
console.log('  - GET /admin/quiz-summary');
console.log('  - GET /admin/user-context');

// POST /admin/quiz - Create new quiz with full structure
// Protected: Requires authentication (user or admin can create quizzes, Shopify shops can create quizzes)
router.post('/admin/quiz', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const data: QuizCreationRequest = req.body;

    // Validate required fields
    if (!data.quiz_name || !data.product_page_url || !data.questions || !Array.isArray(data.questions)) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: quiz_name, product_page_url, and questions array are required'
      });
    }

    // Block custom_domain for Shopify users
    if (req.authType === 'shopify' && data.custom_domain) {
      return res.status(400).json({
        success: false,
        message: 'Custom domains are not available for Shopify apps. Use the default quiz URL instead.'
      });
    }

    // Validate image URLs if provided
    if (data.brand_logo_url && !cloudinaryService.isValidCloudinaryUrl(data.brand_logo_url)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid brand_logo_url format. Must be a valid Cloudinary URL.'
      });
    }

    // Validate questions structure
    for (const question of data.questions) {
      // Validate interaction_type (required for all)
      if (!question.interaction_type) {
        return res.status(400).json({
          success: false,
          message: 'Each question must have interaction_type'
        });
      }

      // Validate question_text (required for all except info_screen)
      if (question.interaction_type !== 'info_screen' && (!question.question_text || question.question_text.trim().length === 0)) {
        return res.status(400).json({
          success: false,
          message: 'Each question must have question_text (except info_screen)'
        });
      }

      // Helper for question label in error messages
      const questionLabel = question.question_text || `Question (${question.interaction_type})`;

      // Validate question image URL if provided
      if (question.image_url && !cloudinaryService.isValidCloudinaryUrl(question.image_url)) {
        return res.status(400).json({
          success: false,
          message: `Invalid image_url format for question "${questionLabel}". Must be a valid Cloudinary URL.`
        });
      }

      // Options validation (skip for fake_loader, info_screen, result_page, and timeline_projection)
      if (question.interaction_type !== 'fake_loader' && question.interaction_type !== 'info_screen' && question.interaction_type !== 'result_page' && question.interaction_type !== 'timeline_projection') {
        if (!question.options || !Array.isArray(question.options)) {
          return res.status(400).json({
            success: false,
            message: `Question "${questionLabel}" must have an options array`
          });
        }

        // Validate options structure
        for (const option of question.options) {
        if (!option.option_text) {
          return res.status(400).json({
            success: false,
            message: 'Each option must have option_text'
          });
        }
        
        // Auto-generate associated_value if not provided (deprecated field)
        if (!option.associated_value || option.associated_value.trim() === '') {
          option.associated_value = option.option_text
            .toLowerCase()
            .trim()
            .replace(/\s+/g, '_')
            .replace(/[^a-z0-9_]/g, '');
        }

        // Validate option image URLs if provided
        if (option.option_image_url && !cloudinaryService.isValidCloudinaryUrl(option.option_image_url)) {
          return res.status(400).json({
            success: false,
            message: `Invalid option_image_url format for option "${option.option_text}". Must be a valid Cloudinary URL.`
          });
        }
        }
      }

      // Validate timeline_projection_config if interaction_type is timeline_projection
      if (question.interaction_type === 'timeline_projection') {
        if (!question.timeline_projection_config) {
          return res.status(400).json({
            success: false,
            message: `Question "${questionLabel}" must have timeline_projection_config`
          });
        }

        const config = question.timeline_projection_config;
        if (config.direction !== 'ascendent' && config.direction !== 'descendent') {
          return res.status(400).json({
            success: false,
            message: `Question "${questionLabel}": timeline_projection_config.direction must be "ascendent" or "descendent"`
          });
        }

        if (typeof config.months_count !== 'number' || config.months_count < 1 || config.months_count > 60) {
          return res.status(400).json({
            success: false,
            message: `Question "${questionLabel}": timeline_projection_config.months_count must be a number between 1 and 60`
          });
        }
      }
    }

    // Determine userId and shopId based on auth type
    let userId: number | null = null;
    let shopId: number | null = null;

    if (req.authType === 'shopify') {
      // Shopify user
      if (!req.shopId) {
        return res.status(401).json({
          success: false,
          message: 'Shop authentication required'
        });
      }
      shopId = req.shopId;
    } else {
      // Native user
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
      }
      userId = req.user.userId;
    }

    const result = await quizCreationService.createQuiz(data, userId, shopId);
    res.status(201).json(result);

  } catch (error: any) {
    console.error('❌ Error creating quiz:', error);
    
    // Handle duplicate domain error
    if (error.code === '23505' && error.constraint === 'unique_custom_domain') {
      return res.status(400).json({
        success: false,
        message: 'This domain is already assigned to another quiz'
      });
    }
    
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to create quiz. Transaction rolled back.'
    });
  }
});

// PUT /admin/quiz/:quizId - Update existing quiz with full structure
// Protected: Requires authentication (user can update own quizzes, admin can update any)
router.put('/admin/quiz/:quizId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { quizId } = req.params;
    const data: QuizCreationRequest = req.body;

    // Validate quiz ID
    if (!quizId || isNaN(parseInt(quizId))) {
      return res.status(400).json({
        success: false,
        message: 'Valid quiz ID is required'
      });
    }

    // Validate required fields
    if (!data.quiz_name || !data.product_page_url || !data.questions || !Array.isArray(data.questions)) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: quiz_name, product_page_url, and questions array are required'
      });
    }

    // Validate at least one question
    if (data.questions.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Quiz must have at least one question'
      });
    }

    // Validate image URLs if provided
    if (data.brand_logo_url && !cloudinaryService.isValidCloudinaryUrl(data.brand_logo_url)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid brand_logo_url format. Must be a valid Cloudinary URL.'
      });
    }

    // Block custom_domain for Shopify users
    if (req.authType === 'shopify' && data.custom_domain) {
      return res.status(400).json({
        success: false,
        message: 'Custom domains are not available for Shopify apps. Use the default quiz URL instead.'
      });
    }

    // Validate custom_domain if provided (native users only)
    if (data.custom_domain) {
      const domainValidation = validateDomain(data.custom_domain);
      if (!domainValidation.isValid) {
        return res.status(400).json({
          success: false,
          message: domainValidation.error
        });
      }
      // Normalize domain (lowercase, trim, remove protocol and trailing slash)
      data.custom_domain = data.custom_domain.toLowerCase().trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
    }

    // Validate questions structure
    for (const question of data.questions) {
      // Validate interaction_type (required for all)
      if (!question.interaction_type) {
        return res.status(400).json({
          success: false,
          message: 'Each question must have interaction_type'
        });
      }

      // Validate question_text (required for all except info_screen)
      if (question.interaction_type !== 'info_screen' && (!question.question_text || question.question_text.trim().length === 0)) {
        return res.status(400).json({
          success: false,
          message: 'Each question must have question_text (except info_screen)'
        });
      }

      // Helper for question label in error messages
      const questionLabel = question.question_text || `Question (${question.interaction_type})`;

      // Validate question image URL if provided
      if (question.image_url && !cloudinaryService.isValidCloudinaryUrl(question.image_url)) {
        return res.status(400).json({
          success: false,
          message: `Invalid image_url format for question "${questionLabel}". Must be a valid Cloudinary URL.`
        });
      }

      // Options validation (skip for fake_loader, info_screen, result_page, and timeline_projection)
      if (question.interaction_type !== 'fake_loader' && question.interaction_type !== 'info_screen' && question.interaction_type !== 'result_page' && question.interaction_type !== 'timeline_projection') {
        if (!question.options || !Array.isArray(question.options)) {
          return res.status(400).json({
            success: false,
            message: `Question "${questionLabel}" must have an options array`
          });
        }

        // Validate options structure
        for (const option of question.options) {
          if (!option.option_text) {
            return res.status(400).json({
              success: false,
              message: 'Each option must have option_text'
            });
          }
          
          // Auto-generate associated_value if not provided (deprecated field)
          if (!option.associated_value || option.associated_value.trim() === '') {
            option.associated_value = option.option_text
              .toLowerCase()
              .trim()
              .replace(/\s+/g, '_')
              .replace(/[^a-z0-9_]/g, '');
          }

          // Validate option image URLs if provided
          if (option.option_image_url && !cloudinaryService.isValidCloudinaryUrl(option.option_image_url)) {
            return res.status(400).json({
              success: false,
              message: `Invalid option_image_url format for option "${option.option_text}". Must be a valid Cloudinary URL.`
            });
          }
        }
      }

      // Validate timeline_projection_config if interaction_type is timeline_projection
      if (question.interaction_type === 'timeline_projection') {
        if (!question.timeline_projection_config) {
          return res.status(400).json({
            success: false,
            message: `Question "${questionLabel}" must have timeline_projection_config`
          });
        }

        const config = question.timeline_projection_config;
        if (config.direction !== 'ascendent' && config.direction !== 'descendent') {
          return res.status(400).json({
            success: false,
            message: `Question "${questionLabel}": timeline_projection_config.direction must be "ascendent" or "descendent"`
          });
        }

        if (typeof config.months_count !== 'number' || config.months_count < 1 || config.months_count > 60) {
          return res.status(400).json({
            success: false,
            message: `Question "${questionLabel}": timeline_projection_config.months_count must be a number between 1 and 60`
          });
        }
      }
    }

    // Determine userId and shopId based on auth type
    let userId: number | null = null;
    let shopId: number | null = null;
    let userRole: 'user' | 'admin' = 'user';

    if (req.authType === 'shopify') {
      // Shopify user
      if (!req.shopId) {
        return res.status(401).json({
          success: false,
          message: 'Shop authentication required'
        });
      }
      shopId = req.shopId;
    } else {
      // Native user
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
      }
      userId = req.user.userId;
      userRole = req.user.role;
    }

    const result = await quizCreationService.updateQuiz(
      parseInt(quizId), 
      data, 
      userId, 
      userRole,
      shopId
    );
    res.status(200).json(result);

  } catch (error: any) {
    console.error('❌ Error updating quiz:', error);
    
    if (error.message === 'Quiz not found') {
      return res.status(404).json({
        success: false,
        message: 'Quiz not found'
      });
    }

    // Handle authorization errors
    if (error.message.includes('Unauthorized')) {
      return res.status(403).json({
        success: false,
        message: error.message
      });
    }

    // Handle duplicate domain error
    if (error.code === '23505' && error.constraint === 'unique_custom_domain') {
      return res.status(400).json({
        success: false,
        message: 'This domain is already assigned to another quiz'
      });
    }

    // Handle validation errors
    if (error.message.includes('Duplicate sequence_order') || 
        error.message.includes('at least one active question') ||
        error.message.includes('Cannot restore question')) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: error.message || 'Failed to update quiz. Transaction rolled back.'
    });
  }
});

// DELETE /admin/quiz/:quizId - Delete a quiz
// Protected: Requires authentication (user can delete own quizzes, admin can delete any)
router.delete('/admin/quiz/:quizId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { quizId } = req.params;

    // Validate quiz ID
    if (!quizId || isNaN(parseInt(quizId))) {
      return res.status(400).json({
        success: false,
        message: 'Valid quiz ID is required'
      });
    }

    // Determine userId and shopId based on auth type
    let userId: number | null = null;
    let shopId: number | null = null;
    let userRole: 'user' | 'admin' = 'user';

    if (req.authType === 'shopify') {
      // Shopify user
      if (!req.shopId) {
        return res.status(401).json({
          success: false,
          message: 'Shop ID not found in request'
        });
      }
      shopId = req.shopId;
    } else {
      // Native user
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }
      userId = req.user.userId;
      userRole = req.user.role as 'user' | 'admin';
    }

    const result = await quizCreationService.deleteQuiz(
      parseInt(quizId, 10),
      userId,
      userRole,
      shopId
    );

    res.status(200).json(result);

  } catch (error: any) {
    console.error('❌ Error deleting quiz:', error);
    
    if (error.message === 'Quiz not found') {
      return res.status(404).json({
        success: false,
        message: error.message
      });
    }
    
    if (error.message.includes('Unauthorized')) {
      return res.status(403).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: error.message || 'Failed to delete quiz'
    });
  }
});

// GET /admin/quiz/:quizId - Get quiz data for editing
// Protected: Requires authentication (user can view own quizzes, admin can view any)
router.get('/admin/quiz/:quizId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { quizId } = req.params;

    // Validate quiz ID
    if (!quizId || isNaN(parseInt(quizId))) {
      return res.status(400).json({
        success: false,
        message: 'Valid quiz ID is required'
      });
    }

    // Determine userId and shopId based on auth type
    let userId: number | null = null;
    let shopId: number | null = null;
    let userRole: 'user' | 'admin' = 'user';

    if (req.authType === 'shopify') {
      // Shopify user
      if (!req.shopId) {
        return res.status(401).json({
          success: false,
          message: 'Shop authentication required'
        });
      }
      shopId = req.shopId;
    } else {
      // Native user
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
      }
      userId = req.user.userId;
      userRole = req.user.role;
    }

    const quizData = await quizCreationService.getQuizForEditing(
      parseInt(quizId), 
      userId, 
      userRole,
      shopId
    );
    
    res.status(200).json({
      success: true,
      data: quizData
    });

  } catch (error: any) {
    console.error('❌ Error fetching quiz for editing:', error);
    
    if (error.message === 'Quiz not found') {
      return res.status(404).json({
        success: false,
        message: 'Quiz not found'
      });
    }

    // Handle authorization errors
    if (error.message.includes('Unauthorized')) {
      return res.status(403).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch quiz data for editing'
    });
  }
});

// GET /admin/quiz-summary - Get summary metrics for quizzes
// Protected: Requires authentication (user sees own quizzes, admin can see all or own, Shopify shops see own quizzes)
// Query params: ?viewMode=all|my (admin only, defaults to 'all' for admin, 'my' for users/shops)
router.get('/admin/quiz-summary', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    // Determine userId, shopId, and userRole based on auth type
    let userId: number | null = null;
    let shopId: number | null = null;
    let userRole: 'user' | 'admin' = 'user';

    if (req.authType === 'shopify') {
      // Shopify user
      if (!req.shopId) {
        return res.status(401).json({
          success: false,
          message: 'Shop authentication required'
        });
      }
      shopId = req.shopId;
    } else {
      // Native user
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
      }
      userId = req.user.userId;
      userRole = req.user.role;
    }

    const viewMode = req.query.viewMode as string || 'all';
    
    // For regular users/shops, always use 'my' (ignore query param for security)
    const effectiveViewMode = userRole === 'admin' ? viewMode : 'my';
    const showAll = userRole === 'admin' && effectiveViewMode === 'all';

    console.log(`📊 Fetching quiz summary metrics for ${userId ? `user ${userId}` : `shop ${shopId}`} (viewMode: ${effectiveViewMode})...`);
    
    const summaryMetrics = await adminService.getQuizSummaryMetrics(
      userId, 
      userRole,
      showAll,
      shopId
    );
    
    res.json({
      success: true,
      data: summaryMetrics
    });
    
  } catch (error: any) {
    console.error('❌ Error fetching quiz summary metrics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch quiz summary metrics'
    });
  }
});

// GET /admin/quiz/:quizId/dns-instructions - Get DNS configuration instructions for custom domain
// Protected: Requires authentication (user can view own quizzes, admin can view any)
router.get('/admin/quiz/:quizId/dns-instructions', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { quizId } = req.params;

    // Validate quiz ID
    if (!quizId || isNaN(parseInt(quizId))) {
      return res.status(400).json({
        success: false,
        message: 'Valid quiz ID is required'
      });
    }

    // Get user info from authenticated request
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    // Get quiz data to check ownership and get custom_domain
    const quizData = await quizCreationService.getQuizForEditing(
      parseInt(quizId),
      req.user.userId,
      req.user.role
    );

    // Check if custom_domain is set
    if (!quizData.custom_domain || quizData.custom_domain.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No custom domain configured for this quiz'
      });
    }

    const domain = quizData.custom_domain.toLowerCase().trim();
    
    // Detect domain type: count dots to determine if subdomain or root domain
    const dotCount = (domain.match(/\./g) || []).length;
    const isSubdomain = dotCount >= 2; // e.g., shop.brandx.com has 2 dots
    
    // Get environment variables
    const vpsIp = process.env.VPS_IP || '158.69.193.219';
    const cnameTarget = process.env.CNAME_TARGET || 'domains.try-directquiz.com';
    
    let dnsInstructions;
    
    if (isSubdomain) {
      // Subdomain: use CNAME
      const subdomainPart = domain.split('.')[0]; // e.g., "shop" from "shop.brandx.com"
      dnsInstructions = {
        domainType: 'subdomain',
        dnsType: 'CNAME',
        name: subdomainPart,
        value: cnameTarget,
        instructions: [
          `Create a CNAME record with name "${subdomainPart}"`,
          `Point it to "${cnameTarget}"`,
          `Wait for DNS propagation (can take up to 48 hours)`
        ]
      };
    } else {
      // Root domain: use A record
      dnsInstructions = {
        domainType: 'root',
        dnsType: 'A',
        name: '@',
        value: vpsIp,
        instructions: [
          `Create an A record with name "@" (or leave blank)`,
          `Point it to "${vpsIp}"`,
          `Wait for DNS propagation (can take up to 48 hours)`
        ]
      };
    }

    res.status(200).json({
      success: true,
      data: {
        domain,
        ...dnsInstructions
      }
    });

  } catch (error: any) {
    console.error('❌ Error fetching DNS instructions:', error);
    
    if (error.message === 'Quiz not found') {
      return res.status(404).json({
        success: false,
        message: 'Quiz not found'
      });
    }

    // Handle authorization errors
    if (error.message.includes('Unauthorized')) {
      return res.status(403).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch DNS instructions'
    });
  }
});

// GET /admin/quiz/:quizId/verify-domain - Verify if custom domain DNS is configured correctly
// Protected: Requires authentication (user can view own quizzes, admin can view any)
router.get('/admin/quiz/:quizId/verify-domain', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { quizId } = req.params;

    // Validate quiz ID
    if (!quizId || isNaN(parseInt(quizId))) {
      return res.status(400).json({
        success: false,
        message: 'Valid quiz ID is required'
      });
    }

    // Get user info from authenticated request
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    // Get quiz data to check ownership and get custom_domain
    const quizData = await quizCreationService.getQuizForEditing(
      parseInt(quizId),
      req.user.userId,
      req.user.role
    );

    // Check if custom_domain is set
    if (!quizData.custom_domain || quizData.custom_domain.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No custom domain configured for this quiz'
      });
    }

    const domain = quizData.custom_domain.toLowerCase().trim();
    
    // Detect domain type
    const dotCount = (domain.match(/\./g) || []).length;
    const isSubdomain = dotCount >= 2;
    
    // Get environment variables
    const vpsIp = process.env.VPS_IP || '158.69.193.219';
    const cnameTarget = process.env.CNAME_TARGET || 'domains.try-directquiz.com';
    
    let verified = false;
    let dnsConfigured = false;
    let pointsToCorrectTarget = false;
    let resolvedValue: string | null = null;
    let message = '';

    try {
      if (isSubdomain) {
        // Check CNAME record
        try {
          const cnameRecords = await resolveCname(domain);
          dnsConfigured = cnameRecords.length > 0;
          
          if (dnsConfigured) {
            resolvedValue = cnameRecords[0];
            // Check if CNAME points to our target (case-insensitive)
            pointsToCorrectTarget = cnameRecords.some(record => 
              record.toLowerCase() === cnameTarget.toLowerCase()
            );
            verified = pointsToCorrectTarget;
            
            if (verified) {
              message = 'Domain DNS is configured correctly!';
            } else {
              message = `Domain points to "${resolvedValue}" but should point to "${cnameTarget}"`;
            }
          } else {
            message = 'CNAME record not found. Please configure DNS first.';
          }
        } catch (dnsError: any) {
          if (dnsError.code === 'ENOTFOUND' || dnsError.code === 'ENODATA') {
            message = 'CNAME record not found. Please configure DNS first.';
          } else {
            throw dnsError;
          }
        }
      } else {
        // Check A record
        try {
          const aRecords = await resolve4(domain);
          dnsConfigured = aRecords.length > 0;
          
          if (dnsConfigured) {
            resolvedValue = aRecords[0];
            // Check if A record points to our VPS IP
            pointsToCorrectTarget = aRecords.includes(vpsIp);
            verified = pointsToCorrectTarget;
            
            if (verified) {
              message = 'Domain DNS is configured correctly!';
            } else {
              message = `Domain points to "${resolvedValue}" but should point to "${vpsIp}"`;
            }
          } else {
            message = 'A record not found. Please configure DNS first.';
          }
        } catch (dnsError: any) {
          if (dnsError.code === 'ENOTFOUND' || dnsError.code === 'ENODATA') {
            message = 'A record not found. Please configure DNS first.';
          } else {
            throw dnsError;
          }
        }
      }
    } catch (dnsError: any) {
      console.error('DNS resolution error:', dnsError);
      message = `DNS lookup failed: ${dnsError.message}`;
    }

    res.status(200).json({
      success: true,
      data: {
        domain,
        verified,
        dnsConfigured,
        pointsToCorrectTarget,
        resolvedValue,
        message,
        expectedValue: isSubdomain ? cnameTarget : vpsIp
      }
    });

  } catch (error: any) {
    console.error('❌ Error verifying domain:', error);
    
    if (error.message === 'Quiz not found') {
      return res.status(404).json({
        success: false,
        message: 'Quiz not found'
      });
    }

    // Handle authorization errors
    if (error.message.includes('Unauthorized')) {
      return res.status(403).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: error.message || 'Failed to verify domain'
    });
  }
});

// PATCH /admin/quiz/:quizId/facebook-pixel - Update only Facebook Pixel configuration
// Protected: Requires authentication (user can update own quizzes, admin can update any)
router.patch('/admin/quiz/:quizId/facebook-pixel', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { quizId } = req.params;
    const { facebook_pixel_id, facebook_access_token } = req.body;

    // Validate quiz ID
    if (!quizId || isNaN(parseInt(quizId))) {
      return res.status(400).json({
        success: false,
        message: 'Valid quiz ID is required'
      });
    }

    const quizIdNum = parseInt(quizId);
    const userId = req.user!.userId;
    const userRole = req.user!.role;

    // Verify user has permission to update this quiz
    const quizCheck = await pool.query(
      'SELECT user_id FROM quizzes WHERE quiz_id = $1',
      [quizIdNum]
    );

    if (quizCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Quiz not found'
      });
    }

    // Check permissions: user can only update their own quizzes, admin can update any
    if (userRole !== 'admin' && quizCheck.rows[0].user_id !== userId) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to update this quiz'
      });
    }

    // Validate Pixel ID format if provided
    if (facebook_pixel_id && facebook_pixel_id.trim().length > 0) {
      const pixelIdRegex = /^\d+$/;
      if (!pixelIdRegex.test(facebook_pixel_id.trim())) {
        return res.status(400).json({
          success: false,
          message: 'Facebook Pixel ID must be numeric'
        });
      }
    }

    // Encrypt access token if provided
    let encryptedToken: string | null = null;
    if (facebook_access_token && facebook_access_token.trim().length > 0) {
      encryptedToken = facebookPixelService.encryptToken(facebook_access_token.trim());
    }

    // Update only Facebook Pixel fields
    await pool.query(
      `UPDATE quizzes SET
        facebook_pixel_id = $1,
        facebook_access_token_encrypted = $2
      WHERE quiz_id = $3`,
      [
        facebook_pixel_id && facebook_pixel_id.trim().length > 0 ? facebook_pixel_id.trim() : null,
        encryptedToken,
        quizIdNum
      ]
    );

    console.log(`✅ Facebook Pixel config updated for quiz ID: ${quizIdNum}`);

    return res.json({
      success: true,
      message: 'Facebook Pixel configuration updated successfully',
      data: {
        quiz_id: quizIdNum,
        facebook_pixel_id: facebook_pixel_id && facebook_pixel_id.trim().length > 0 ? facebook_pixel_id.trim() : null
      }
    });

  } catch (error: any) {
    console.error('❌ Error updating Facebook Pixel config:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to update Facebook Pixel configuration'
    });
  }
});

// GET /admin/user-context - Get current user/shop context
// Protected: Requires authentication (returns user or shop info based on auth type)
router.get('/admin/user-context', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (req.authType === 'shopify') {
      // Shopify user context
      if (!req.shop || !req.shopId) {
        return res.status(401).json({
          success: false,
          message: 'Shop authentication required'
        });
      }

      return res.json({
        success: true,
        data: {
          authType: 'shopify',
          shop: {
            shopId: req.shopId,
            shopDomain: req.shop
          },
          features: {
            customDomain: false, // Shopify apps don't support custom domains
            facebookPixel: true,
            analytics: true
          }
        }
      });
    } else {
      // Native user context
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      return res.json({
        success: true,
        data: {
          authType: 'native',
          user: {
            userId: req.user.userId,
            email: req.user.email,
            role: req.user.role
          },
          features: {
            customDomain: true, // Native users can use custom domains
            facebookPixel: true,
            analytics: true
          }
        }
      });
    }
  } catch (error: any) {
    console.error('❌ Error fetching user context:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user context'
    });
  }
});

export default router;
