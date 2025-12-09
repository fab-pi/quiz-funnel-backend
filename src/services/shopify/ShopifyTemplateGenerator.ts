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
    
    /* Break out of theme container constraints - AGGRESSIVE: Override overflow */
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
    main,
    .template-page,
    .page {
      max-width: 100% !important;
      width: 100% !important;
      width: 100vw !important;
      padding-left: 0 !important;
      padding-right: 0 !important;
      margin-left: 0 !important;
      margin-right: 0 !important;
      overflow: visible !important;
      overflow-x: visible !important;
      overflow-y: visible !important;
      max-height: none !important;
      height: auto !important;
      min-height: 100vh !important;
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
      overflow: visible !important;
    }
    
    /* Quiz container - AGGRESSIVE: Fixed positioning to escape all theme containers */
    #quiz-container {
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      right: 0 !important;
      bottom: 0 !important;
      width: 100vw !important;
      width: 100% !important;
      height: 100vh !important;
      min-height: 100vh !important;
      margin: 0 !important;
      padding: 0 !important;
      z-index: 99999 !important;
      background: #fff !important;
      overflow: hidden !important;
    }
    
    /* Ensure body and html allow full viewport */
    html, body {
      height: 100vh !important;
      min-height: 100vh !important;
      margin: 0 !important;
      padding: 0 !important;
      overflow: hidden !important;
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
       * AGGRESSIVE APPROACH: Move quiz container to body level and use fixed positioning
       * This escapes all theme container constraints
       */
      
      let quizContainer = null;
      let quizIframe = null;
      let isMovedToBody = false;
      
      /**
       * Hide page title dynamically
       */
      function hidePageTitle() {
        // Find all h1 elements that might be the page title
        const h1Elements = document.querySelectorAll('h1');
        h1Elements.forEach(function(h1) {
          // Check if this h1 is likely the page title (not inside quiz container)
          const isInQuizContainer = h1.closest('#quiz-container');
          if (!isInQuizContainer) {
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
       * Hide header and footer aggressively
       */
      function hideHeaderFooter() {
        const selectors = [
          '#shopify-section-header',
          '#shopify-section-footer',
          '.shopify-section-header',
          '.shopify-section-footer',
          '.header-wrapper',
          '.footer-wrapper',
          '.site-header',
          '.site-footer',
          'header:not(#quiz-container header)',
          'footer:not(#quiz-container footer)'
        ];
        
        selectors.forEach(function(selector) {
          try {
            const elements = document.querySelectorAll(selector);
            elements.forEach(function(el) {
              el.style.display = 'none';
              el.style.visibility = 'hidden';
              el.style.height = '0';
              el.style.overflow = 'hidden';
              el.style.margin = '0';
              el.style.padding = '0';
            });
          } catch (e) {
            // Ignore invalid selectors
          }
        });
      }
      
      /**
       * Override parent container overflow to allow expansion
       */
      function overrideParentOverflow() {
        if (!quizContainer) return;
        
        let parent = quizContainer.parentElement;
        const maxDepth = 15;
        let depth = 0;
        
        while (parent && depth < maxDepth && parent !== document.body && parent !== document.documentElement) {
          // Override overflow constraints
          parent.style.overflow = 'visible';
          parent.style.overflowX = 'visible';
          parent.style.overflowY = 'visible';
          parent.style.maxHeight = 'none';
          parent.style.height = 'auto';
          parent.style.minHeight = '100vh';
          
          parent = parent.parentElement;
          depth++;
        }
        
        // Also target common container classes
        const containerSelectors = [
          '.page-width',
          '.container',
          '.page-container',
          '.content-wrapper',
          '.wrapper',
          '.main-content',
          '.page-content',
          '#MainContent',
          'main',
          '.template-page',
          '.page'
        ];
        
        containerSelectors.forEach(function(selector) {
          try {
            const elements = document.querySelectorAll(selector);
            elements.forEach(function(el) {
              if (el.contains && el.contains(quizContainer)) {
                el.style.overflow = 'visible';
                el.style.overflowX = 'visible';
                el.style.overflowY = 'visible';
                el.style.maxHeight = 'none';
                el.style.height = 'auto';
                el.style.minHeight = '100vh';
              }
            });
          } catch (e) {
            // Ignore errors
          }
        });
      }
      
      /**
       * Move quiz container to body level (AGGRESSIVE: Escapes all theme containers)
       */
      function moveContainerToBody() {
        if (isMovedToBody) return;
        
        quizContainer = document.getElementById('quiz-container');
        if (!quizContainer) {
          // Retry if container not found yet
          setTimeout(moveContainerToBody, 10);
          return;
        }
        
        // Check if already at body level
        if (quizContainer.parentElement === document.body) {
          isMovedToBody = true;
          return;
        }
        
        // Clone the container with all its content
        const clonedContainer = quizContainer.cloneNode(true);
        clonedContainer.id = 'quiz-container';
        
        // Remove old container
        quizContainer.remove();
        
        // Append to body (outside all theme containers)
        document.body.appendChild(clonedContainer);
        quizContainer = clonedContainer;
        quizIframe = document.getElementById("${iframeId}");
        
        isMovedToBody = true;
        console.log('✅ Quiz container moved to body level');
      }
      
      /**
       * Apply fixed positioning and full viewport dimensions
       */
      function applyFixedPositioning() {
        if (!quizContainer) return;
        
        // Calculate available viewport height (account for any visible header/footer)
        const headerHeight = document.querySelector('header') ? 
          (document.querySelector('header').offsetHeight || 0) : 0;
        const footerHeight = document.querySelector('footer') ? 
          (document.querySelector('footer').offsetHeight || 0) : 0;
        const availableHeight = window.innerHeight - headerHeight - footerHeight;
        
        // Apply fixed positioning to escape all containers
        quizContainer.style.position = 'fixed';
        quizContainer.style.top = '0';
        quizContainer.style.left = '0';
        quizContainer.style.right = '0';
        quizContainer.style.bottom = '0';
        quizContainer.style.width = '100vw';
        quizContainer.style.width = '100%';
        quizContainer.style.height = availableHeight + 'px';
        quizContainer.style.height = '100vh';
        quizContainer.style.minHeight = '100vh';
        quizContainer.style.margin = '0';
        quizContainer.style.padding = '0';
        quizContainer.style.zIndex = '99999';
        quizContainer.style.backgroundColor = '#fff';
        quizContainer.style.overflow = 'hidden';
        
        // Apply to iframe
        if (quizIframe) {
          quizIframe.style.width = '100%';
          quizIframe.style.width = '100vw';
          quizIframe.style.height = availableHeight + 'px';
          quizIframe.style.height = '100vh';
          quizIframe.style.minHeight = '100vh';
          quizIframe.style.border = 'none';
          quizIframe.style.display = 'block';
          quizIframe.style.margin = '0';
          quizIframe.style.padding = '0';
        }
        
        // Also ensure body and html allow full height
        document.body.style.height = '100vh';
        document.body.style.minHeight = '100vh';
        document.body.style.margin = '0';
        document.body.style.padding = '0';
        document.body.style.overflow = 'hidden';
        
        document.documentElement.style.height = '100vh';
        document.documentElement.style.minHeight = '100vh';
        document.documentElement.style.margin = '0';
        document.documentElement.style.padding = '0';
      }
      
      /**
       * Setup iframe with UTM parameter passing
       */
      function setupIframe() {
        quizIframe = document.getElementById("${iframeId}");
        if (!quizIframe) {
          setTimeout(setupIframe, 10);
          return;
        }
        
        // Extract all URL parameters from parent page (including UTMs)
        const urlParams = new URLSearchParams(window.location.search);
        const utmString = urlParams.toString();
        
        // Build quiz URL with UTM parameters
        const baseUrl = "${quizBaseUrl}";
        const quizUrl = utmString ? baseUrl + "?" + utmString : baseUrl;
        
        // Set iframe source with UTM parameters
        quizIframe.src = quizUrl;
        console.log('✅ Quiz iframe loaded:', quizUrl);
      }
      
      /**
       * Initialize everything (AGGRESSIVE APPROACH)
       */
      function initialize() {
        // Step 1: Hide page title and header/footer
        hidePageTitle();
        hideHeaderFooter();
        
        // Step 2: Move container to body level (escapes all theme containers)
        moveContainerToBody();
        
        // Step 3: Override parent overflow constraints
        overrideParentOverflow();
        
        // Step 4: Apply fixed positioning and full viewport
        applyFixedPositioning();
        
        // Step 5: Setup iframe
        setupIframe();
      }
      
      /**
       * Update dimensions on resize
       */
      function updateDimensions() {
        if (!quizContainer || !quizIframe) return;
        
        const headerHeight = document.querySelector('header') ? 
          (document.querySelector('header').offsetHeight || 0) : 0;
        const footerHeight = document.querySelector('footer') ? 
          (document.querySelector('footer').offsetHeight || 0) : 0;
        const availableHeight = window.innerHeight - headerHeight - footerHeight;
        
        quizContainer.style.height = availableHeight + 'px';
        quizContainer.style.height = '100vh';
        quizIframe.style.height = availableHeight + 'px';
        quizIframe.style.height = '100vh';
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
          window.location.href = event.data.redirectUrl;
        }
      });
      
      // Run immediately (in case DOM is already ready)
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", function() {
          initialize();
          
          // Set up MutationObserver to catch dynamically added elements
          const observer = new MutationObserver(function(mutations) {
            hidePageTitle();
            hideHeaderFooter();
            if (!isMovedToBody) {
              moveContainerToBody();
              applyFixedPositioning();
            }
          });
          
          observer.observe(document.body, {
            childList: true,
            subtree: true
          });
        });
      } else {
        // DOM already loaded, run immediately
        initialize();
        
        // Set up MutationObserver
        const observer = new MutationObserver(function(mutations) {
          hidePageTitle();
          hideHeaderFooter();
          if (!isMovedToBody) {
            moveContainerToBody();
            applyFixedPositioning();
          }
        });
        
        observer.observe(document.body, {
          childList: true,
          subtree: true
        });
      }
      
      // Handle window resize
      window.addEventListener('resize', function() {
        updateDimensions();
        hidePageTitle();
        hideHeaderFooter();
      });
      
      // Also handle orientation change
      window.addEventListener('orientationchange', function() {
        setTimeout(function() {
          updateDimensions();
          applyFixedPositioning();
        }, 100);
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

