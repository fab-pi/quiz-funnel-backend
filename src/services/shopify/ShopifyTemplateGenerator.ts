/**
 * Shopify Template Generator
 * Generates Liquid template HTML for embedding quiz iframe in Shopify pages
 */
export class ShopifyTemplateGenerator {
  /**
   * Generate Liquid template HTML with iframe for quiz (for body field)
   * @deprecated Use generateFullLiquidTemplate() for custom templates
   * @param quizId - Quiz ID
   * @param shopDomain - Shop domain (e.g., mystore.myshopify.com)
   * @param frontendUrl - Frontend URL where quiz is hosted (e.g., https://quiz.try-directquiz.com)
   * @returns Liquid template HTML string (body content only)
   */
  generateQuizIframeTemplate(
    quizId: number,
    shopDomain: string,
    frontendUrl: string = process.env.SHOPIFY_APP_URL || 'https://quiz.try-directquiz.com'
  ): string {
    // Generate iframe ID (unique per quiz)
    const iframeId = `quiz-iframe-${quizId}`;
    
    // Build quiz URL (using embed route for iframe)
    const quizBaseUrl = `${frontendUrl}/embed/quiz/${quizId}`;

    // Return only the inner content (no <html>, <head>, <body> tags)
    // Shopify will insert this into the theme's page template via {{ page.content }}
    return `
  <style>
    /* Reset and base styles */
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    html, body {
      width: 100%;
      height: 100%;
      min-height: 100vh;
      overflow-x: hidden;
      margin: 0;
      padding: 0;
    }
    
    /* Hide Shopify store header and footer */
    #shopify-section-header,
    #shopify-section-footer,
    .shopify-section-header,
    .shopify-section-footer,
    .header-wrapper,
    .footer-wrapper,
    .site-header,
    .site-footer,
    header:not(#quiz-container header),
    footer:not(#quiz-container footer) {
      display: none !important;
      visibility: hidden !important;
      height: 0 !important;
      overflow: hidden !important;
      margin: 0 !important;
      padding: 0 !important;
    }
    
    /* Ensure main content area takes full height */
    main,
    .main-content,
    .page-content,
    #MainContent {
      height: 100vh !important;
      min-height: 100vh !important;
      margin: 0 !important;
      padding: 0 !important;
    }
    
    /* Quiz iframe container - full height */
    #quiz-container {
      width: 100%;
      height: 100vh;
      min-height: 100vh;
      margin: 0;
      padding: 0;
      position: relative;
    }
    
    /* Iframe styling - full height */
    #${iframeId} {
      width: 100%;
      height: 100vh;
      min-height: 100vh;
      border: none;
      display: block;
    }
    
    /* Override any Shopify theme container constraints */
    .container,
    .page-container,
    .content-wrapper {
      max-width: 100% !important;
      width: 100% !important;
      height: 100vh !important;
      min-height: 100vh !important;
      margin: 0 !important;
      padding: 0 !important;
    }
  </style>
  
  <div id="quiz-container">
    <iframe id="${iframeId}" width="100%" height="100%" frameborder="0"></iframe>
  </div>

  <script>
    (function() {
      /**
       * Setup iframe with UTM parameter passing
       */
      function setupIframe() {
        // Extract all URL parameters from parent page (including UTMs)
        const urlParams = new URLSearchParams(window.location.search);
        const utmString = urlParams.toString();
        
        // Build quiz URL with UTM parameters
        const baseUrl = "${quizBaseUrl}";
        const quizUrl = utmString ? baseUrl + "?" + utmString : baseUrl;
        
        // Get iframe element
        const iframe = document.getElementById("${iframeId}");
        
        if (iframe) {
          // Set iframe source with UTM parameters
          iframe.src = quizUrl;
          console.log('✅ Quiz iframe loaded:', quizUrl);
        } else {
          // Retry if iframe not found yet
          setTimeout(setupIframe, 10);
        }
      }
      
      /**
       * Listen for quiz completion and redirect parent page
       */
      window.addEventListener('message', function(event) {
        // Security: Verify origin (optional but recommended)
        // Uncomment and update with your frontend domain:
        // if (event.origin !== '${frontendUrl.replace(/^https?:\/\//, '')}') return;
        
        // Handle quiz completion event
        if (event.data && event.data.type === 'quiz_completed' && event.data.redirectUrl) {
          console.log('✅ Quiz completed, redirecting to:', event.data.redirectUrl);
          
          // Redirect the parent page (Shopify page) to the product page
          window.location.href = event.data.redirectUrl;
        }
      });
      
      // Initialize iframe when DOM is ready
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", setupIframe);
      } else {
        setupIframe();
      }
      
      // Handle window resize to maintain full height
      window.addEventListener('resize', function() {
        const container = document.getElementById('quiz-container');
        const iframe = document.getElementById("${iframeId}");
        if (container && iframe) {
          container.style.height = window.innerHeight + 'px';
          container.style.minHeight = window.innerHeight + 'px';
          iframe.style.height = window.innerHeight + 'px';
        }
      });
    })();
  </script>
`;
  }

  /**
   * Generate full Liquid template file for custom page template
   * This creates a complete standalone HTML document that will be used as a custom page template
   * @param quizId - Quiz ID
   * @param shopDomain - Shop domain (e.g., mystore.myshopify.com)
   * @param frontendUrl - Frontend URL where quiz is hosted (e.g., https://quiz.try-directquiz.com)
   * @returns Complete Liquid template file content
   */
  generateFullLiquidTemplate(
    quizId: number,
    shopDomain: string,
    frontendUrl: string = process.env.SHOPIFY_APP_URL || process.env.FRONTEND_URL || 'https://quiz.try-directquiz.com'
  ): string {
    // Generate iframe ID (unique per quiz)
    const iframeId = `quiz-iframe-${quizId}`;
    
    // Build quiz URL (using embed route for iframe)
    const quizBaseUrl = `${frontendUrl}/embed/quiz/${quizId}`;

    // Return complete Liquid template file
    // This is a standalone template that will be used as page.quiz-app-iframe.liquid
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{ page.title | default: 'Quiz' }}</title>
  <meta name="robots" content="noindex, nofollow">
  
  <style>
    /* Reset and base styles */
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    html, body {
      width: 100%;
      height: 100%;
      min-height: 100vh;
      overflow-x: hidden;
      margin: 0;
      padding: 0;
    }
    
    /* Quiz iframe container - full height */
    #quiz-container {
      width: 100%;
      height: 100vh;
      min-height: 100vh;
      margin: 0;
      padding: 0;
      position: relative;
    }
    
    /* Iframe styling - full height */
    #${iframeId} {
      width: 100%;
      height: 100vh;
      min-height: 100vh;
      border: none;
      display: block;
    }
  </style>
</head>
<body>
  <div id="quiz-container">
    <iframe id="${iframeId}" width="100%" height="100%" frameborder="0"></iframe>
  </div>

  <script>
    (function() {
      /**
       * Setup iframe with UTM parameter passing
       */
      function setupIframe() {
        // Extract all URL parameters from parent page (including UTMs)
        const urlParams = new URLSearchParams(window.location.search);
        const utmString = urlParams.toString();
        
        // Build quiz URL with UTM parameters
        const baseUrl = "${quizBaseUrl}";
        const quizUrl = utmString ? baseUrl + "?" + utmString : baseUrl;
        
        // Get iframe element
        const iframe = document.getElementById("${iframeId}");
        
        if (iframe) {
          // Set iframe source with UTM parameters
          iframe.src = quizUrl;
          console.log('✅ Quiz iframe loaded:', quizUrl);
        } else {
          // Retry if iframe not found yet
          setTimeout(setupIframe, 10);
        }
      }
      
      /**
       * Listen for quiz completion and redirect parent page
       */
      window.addEventListener('message', function(event) {
        // Security: Verify origin (optional but recommended)
        // Uncomment and update with your frontend domain:
        // if (event.origin !== '${frontendUrl.replace(/^https?:\/\//, '')}') return;
        
        // Handle quiz completion event
        if (event.data && event.data.type === 'quiz_completed' && event.data.redirectUrl) {
          console.log('✅ Quiz completed, redirecting to:', event.data.redirectUrl);
          
          // Redirect the parent page (Shopify page) to the product page
          window.location.href = event.data.redirectUrl;
        }
      });
      
      // Initialize iframe when DOM is ready
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", setupIframe);
      } else {
        setupIframe();
      }
      
      // Handle window resize to maintain full height
      window.addEventListener('resize', function() {
        const container = document.getElementById('quiz-container');
        const iframe = document.getElementById("${iframeId}");
        if (container && iframe) {
          container.style.height = window.innerHeight + 'px';
          container.style.minHeight = window.innerHeight + 'px';
          iframe.style.height = window.innerHeight + 'px';
        }
      });
    })();
  </script>
</body>
</html>`;
  }
}

