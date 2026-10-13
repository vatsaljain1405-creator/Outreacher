/**
 * Helper utilities for generating and detecting the professional corporate footer (email signature).
 */

export interface FooterConfig {
  forEmail?: boolean // If true, uses cid:ia-logo@outreacher; if false, uses /ia-logo.png for web preview
}

/**
 * Returns the exact HTML markup for the official India Accelerator corporate signature.
 */
export function getProfessionalFooterHtml(config: FooterConfig = {}): string {
  const imageSrc = config.forEmail ? "cid:ia-logo@outreacher" : "/ia-logo.png"

  return `
<!-- professional-footer -->
<div class="email-professional-footer" style="margin-top: 28px; padding-top: 14px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 13px; line-height: 1.45; color: #222222;">
  <p style="margin: 0 0 14px 0; font-size: 13px; color: #222222; line-height: 1.4;">Best Regards,</p>
  
  <div style="margin: 14px 0 14px 0;">
    <img src="${imageSrc}" alt="India Accelerator" width="130" style="display: block; width: 130px; max-width: 130px; height: auto; border: 0; outline: none; text-decoration: none;" />
  </div>

  <div style="margin-top: 14px;">
    <div style="font-size: 14px; font-weight: 700; color: #e21c24; margin-bottom: 2px; line-height: 1.3;">
      Vatsal Jain
    </div>
    <div style="font-size: 13px; font-weight: 700; color: #000000; margin-bottom: 3px; line-height: 1.3;">
      India Accelerator, MGF Metropolis Mall
    </div>
    <div style="margin-bottom: 3px; line-height: 1.3;">
      <a href="https://maps.google.com/?q=MG+Road,+Gurugram+-+122002" target="_blank" rel="noopener noreferrer" style="color: #1155cc; text-decoration: underline; font-size: 13px;">
        MG Road, Gurugram - 122002
      </a>
    </div>
    <div style="font-size: 13px; color: #000000; margin-bottom: 3px; line-height: 1.3;">
      Contact: 94785 09991
    </div>
    <div style="font-size: 13px; color: #000000; line-height: 1.3;">
      Email - <a href="mailto:vatsal.jain@indiaaccelerator.co" style="color: #1155cc; text-decoration: underline; font-size: 13px;">vatsal.jain@indiaaccelerator.co</a>
    </div>
  </div>
</div>
<!-- /professional-footer -->
`.trim()
}

/**
 * Checks whether an HTML string already includes the professional footer.
 */
export function hasProfessionalFooter(html: string): boolean {
  if (!html) return false
  if (html.includes("professional-footer")) return true
  if (html.includes("vatsal.jain@indiaaccelerator.co") && html.includes("India Accelerator")) return true
  return false
}
