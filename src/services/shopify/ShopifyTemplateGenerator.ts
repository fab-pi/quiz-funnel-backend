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
    /* Hide page title - target common Shopify theme patterns */
    h1.page-title,
    h1.section-header__title,
    .page-title,
    .section-header__title,
    main h1:first-of-type,
    #MainContent h1:first-of-type,
    .main-content h1:first-of-type,
    .page-content h1:first-of-type,
    .template-page h1,
    .page-header h1 {
      display: none !important;
      visibility: hidden !important;
      height: 0 !important;
      margin: 0 !important;
      padding: 0 !important;
      overflow: hidden !important;
      line-height: 0 !important;
      font-size: 0 !important;
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
    
    /* Break out of theme container constraints - target ALL common Shopify theme containers */
    .page-width,
    .page-width--narrow,
    .page-width--wide,
    .container,
    .container--narrow,
    .container--wide,
    .page-container,
    .content-wrapper,
    .wrapper,
    .main-content,
    .page-content,
    .section-content,
    .template-page__content,
    #MainContent,
    main {
      max-width: 100% !important;
      width: 100% !important;
      width: 100vw !important;
      padding-left: 0 !important;
      padding-right: 0 !important;
      margin-left: 0 !important;
      margin-right: 0 !important;
    }
    
    /* Ensure main content area takes full viewport */
    main,
    .main-content,
    .page-content,
    #MainContent {
      height: 100vh !important;
      min-height: 100vh !important;
      margin: 0 !important;
      padding: 0 !important;
      overflow: hidden !important;
    }
    
    /* Quiz container - escape theme constraints using fixed positioning */
    #quiz-container {
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      width: 100vw !important;
      width: 100% !important;
      height: 100vh !important;
      min-height: 100vh !important;
      margin: 0 !important;
      padding: 0 !important;
      z-index: 9999 !important;
      background: #fff !important;
    }
    
    /* Alternative: Use absolute positioning if fixed doesn't work */
    body #quiz-container {
      position: absolute !important;
      top: 0 !important;
      left: 0 !important;
      right: 0 !important;
      bottom: 0 !important;
    }
    
    /* Iframe styling - full viewport */
    #${iframeId} {
      width: 100vw !important;
      width: 100% !important;
      height: 100vh !important;
      min-height: 100vh !important;
      border: none !important;
      display: block !important;
      margin: 0 !important;
      padding: 0 !important;
    }
    
    /* Override any parent container that might constrain the quiz container */
    #quiz-container,
    #quiz-container * {
      box-sizing: border-box !important;
    }
  </style>
  
  <div id="quiz-container">
    <iframe id="${iframeId}" width="100%" height="100%" frameborder="0"></iframe>
  </div>

  <script>
    (function() {
      /**
       * Hide page title dynamically (runs immediately and on DOM ready)
       */
      function hidePageTitle() {
        // Find all h1 elements that might be the page title
        const h1Elements = document.querySelectorAll('h1');
        h1Elements.forEach(function(h1) {
          // Check if this h1 is likely the page title (not inside quiz container)
          const isInQuizContainer = h1.closest('#quiz-container');
          if (!isInQuizContainer) {
            // Hide it
            h1.style.display = 'none';
            h1.style.visibility = 'hidden';
            h1.style.height = '0';
            h1.style.margin = '0';
            h1.style.padding = '0';
            h1.style.overflow = 'hidden';
            h1.style.lineHeight = '0';
            h1.style.fontSize = '0';
          }
        });
        
        // Also target common page title classes
        const titleSelectors = [
          '.page-title',
          '.section-header__title',
          '.main-page-title',
          'h1.page-title',
          'h1.section-header__title'
        ];
        
        titleSelectors.forEach(function(selector) {
          const elements = document.querySelectorAll(selector);
          elements.forEach(function(el) {
            el.style.display = 'none';
            el.style.visibility = 'hidden';
            el.style.height = '0';
            el.style.margin = '0';
            el.style.padding = '0';
            el.style.overflow = 'hidden';
          });
        });
      }
      
      /**
       * Break out of theme container constraints dynamically
       */
      function breakOutOfContainers() {
        const container = document.getElementById('quiz-container');
        if (!container) return;
        
        // Find all parent containers and override their constraints
        let parent = container.parentElement;
        const maxDepth = 10; // Prevent infinite loops
        let depth = 0;
        
        while (parent && depth < maxDepth) {
          // Override common container constraints
          parent.style.maxWidth = '100%';
          parent.style.width = '100%';
          parent.style.paddingLeft = '0';
          parent.style.paddingRight = '0';
          parent.style.marginLeft = '0';
          parent.style.marginRight = '0';
          
          // If we've reached body or html, stop
          if (parent.tagName === 'BODY' || parent.tagName === 'HTML') {
            break;
          }
          
          parent = parent.parentElement;
          depth++;
        }
        
        // Also target common container classes directly
        const containerSelectors = [
          '.page-width',
          '.container',
          '.page-container',
          '.content-wrapper',
          '.wrapper',
          '.main-content',
          '.page-content',
          '#MainContent',
          'main'
        ];
        
        containerSelectors.forEach(function(selector) {
          const elements = document.querySelectorAll(selector);
          elements.forEach(function(el) {
            if (el.contains(container)) {
              el.style.maxWidth = '100%';
              el.style.width = '100%';
              el.style.paddingLeft = '0';
              el.style.paddingRight = '0';
              el.style.marginLeft = '0';
              el.style.marginRight = '0';
            }
          });
        });
      }
      
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
       * Initialize everything
       */
      function initialize() {
        // Hide page title immediately
        hidePageTitle();
        
        // Break out of containers
        breakOutOfContainers();
        
        // Setup iframe
        setupIframe();
        
        // Ensure quiz container is full viewport
        const container = document.getElementById('quiz-container');
        const iframe = document.getElementById("${iframeId}");
        if (container) {
          container.style.width = window.innerWidth + 'px';
          container.style.height = window.innerHeight + 'px';
          container.style.minHeight = window.innerHeight + 'px';
        }
        if (iframe) {
          iframe.style.width = window.innerWidth + 'px';
          iframe.style.height = window.innerHeight + 'px';
          iframe.style.minHeight = window.innerHeight + 'px';
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
      
      // Run immediately (in case DOM is already ready)
      initialize();
      
      // Also run on DOM ready
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initialize);
      } else {
        // DOM already loaded, run immediately
        setTimeout(initialize, 0);
      }
      
      // Handle window resize to maintain full viewport
      window.addEventListener('resize', function() {
        const container = document.getElementById('quiz-container');
        const iframe = document.getElementById("${iframeId}");
        if (container) {
          container.style.width = window.innerWidth + 'px';
          container.style.height = window.innerHeight + 'px';
          container.style.minHeight = window.innerHeight + 'px';
        }
        if (iframe) {
          iframe.style.width = window.innerWidth + 'px';
          iframe.style.height = window.innerHeight + 'px';
          iframe.style.minHeight = window.innerHeight + 'px';
        }
        
        // Re-hide page title (in case theme re-renders it)
        hidePageTitle();
        
        // Re-break out of containers
        breakOutOfContainers();
      });
      
      // Use MutationObserver to catch dynamically added page titles
      const observer = new MutationObserver(function(mutations) {
        hidePageTitle();
        breakOutOfContainers();
      });
      
      // Start observing when DOM is ready
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", function() {
          observer.observe(document.body, {
            childList: true,
            subtree: true
          });
        });
      } else {
        observer.observe(document.body, {
          childList: true,
          subtree: true
        });
      }
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
    // Using {% layout none %} to bypass theme.liquid wrapper completely
    return `{% layout none %}
<!DOCTYPE html>
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
      max-height: 100vh;
      overflow: hidden;
      margin: 0;
      padding: 0;
    }
    
    /* Quiz iframe container - full viewport */
    #quiz-container {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      width: 100vw;
      height: 100vh;
      min-height: 100vh;
      margin: 0;
      padding: 0;
      z-index: 99999;
      background: #fff;
      overflow: hidden;
    }
    
    /* Iframe styling - full viewport */
    #${iframeId} {
      width: 100%;
      height: 100%;
      min-height: 100vh;
      border: none;
      display: block;
      margin: 0;
      padding: 0;
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
      
      /**
       * Ensure full viewport height
       */
      function ensureFullHeight() {
        const container = document.getElementById('quiz-container');
        const iframe = document.getElementById("${iframeId}");
        
        if (container) {
          container.style.height = window.innerHeight + 'px';
          container.style.minHeight = window.innerHeight + 'px';
        }
        
        if (iframe) {
          iframe.style.height = window.innerHeight + 'px';
          iframe.style.minHeight = window.innerHeight + 'px';
        }
      }
      
      // Initialize iframe when DOM is ready
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", function() {
          setupIframe();
          ensureFullHeight();
        });
      } else {
        setupIframe();
        ensureFullHeight();
      }
      
      // Handle window resize to maintain full height
      window.addEventListener('resize', function() {
        ensureFullHeight();
      });
    })();
  </script>
</body>
</html>`;
  }
}

