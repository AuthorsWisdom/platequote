import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms and privacy | PlateQuote",
  description: "PlateQuote is a demonstration. How it estimates quotes, runs a PayPal sandbox checkout, and handles your files.",
};

const EFFECTIVE = "November 23, 2026";

export default function TermsPage() {
  return (
    <article className="legal mx-auto max-w-3xl">
      <h1 className="font-heading">Terms and privacy</h1>
      <p className="text-sm text-muted-foreground">Effective {EFFECTIVE}. Plain language on purpose.</p>

      <nav aria-label="Sections" className="text-sm">
        <a href="#who">Who runs this site</a> · <a href="#demo">This site is a demonstration</a> ·{" "}
        <a href="#service">What PlateQuote does</a> · <a href="#quotes">Quotes are estimates</a> ·{" "}
        <a href="#refunds">No orders, payments, or refunds</a> · <a href="#use">Acceptable use and your files</a> ·{" "}
        <a href="#privacy">Your files and privacy</a> · <a href="#liability">No warranty</a> ·{" "}
        <a href="#contact">Contact</a>
      </nav>

      <h2 id="who">Who runs this site</h2>
      <p>
        PlateQuote at platequote.tech is operated by Christopher Espinoza, doing business as PlateQuote, a sole
        proprietor in San Antonio, Texas, United States. Mailing address: 21750 Hardy Oak Blvd Ste 104, PMB 532333,
        San Antonio, Texas 78258-4946. Email: hello@platequote.tech. &ldquo;We&rdquo; and &ldquo;the operator&rdquo;
        below mean this business.
      </p>

      <h2 id="demo">This site is a demonstration</h2>
      <p>
        PlateQuote is a demonstration of quoting software for 3D print shops. Northline Print is a sample shop
        name built into the software; it is not a real shop. Nothing on this site is for sale.
      </p>
      <p>
        Checkout runs in PayPal&rsquo;s sandbox, PayPal&rsquo;s test environment. No real money moves, and real
        PayPal accounts and cards do not work there; only PayPal sandbox test accounts do. Nothing is printed or
        shipped. A second copy of this site runs at platequote-web.onrender.com and works the same way.
      </p>
      <p>
        Because nothing is sold, there are no real orders, charges, refunds, shipping, or sales tax. When this page
        says &ldquo;test order&rdquo;, it means the record the demo creates for each priced quote; a completed
        sandbox checkout marks it paid.
      </p>
      <p>By using this site you agree to these terms. If you do not agree, do not use it.</p>

      <h2 id="service">What PlateQuote does</h2>
      <p>
        You upload a 3D model (STL or 3MF). The site slices it with a generic printer profile, estimates a price
        from the sample shop&rsquo;s posted rates, and lets you try a PayPal sandbox checkout. The printability
        notes and material advice on a quote are written either by a built-in reviewer on our server or, when AI
        review is on, by Anthropic&rsquo;s Claude AI model. The badge on the notes says which one wrote them
        (&ldquo;Built-in review&rdquo; or &ldquo;AI review · Claude&rdquo;).
      </p>
      <p>
        When AI review is on, we send Anthropic a short summary of the print, not your model file. The summary
        contains exactly these items. From the mesh: its size (bounding box), volume, surface area, overhang
        share and the overhang angle threshold used to measure it, wall thickness and a thin-wall flag, triangle
        count, part count, whether it is watertight, whether it fits the printer bed, and whether it would fit if
        rotated. From the slicer estimate: grams, filament volume, print time, whether supports are needed, the
        profile name, and the slicer name. From your choices: the material, quantity, and purpose you picked.
        From the shop: the printer&rsquo;s bed size and the names of the materials the shop stocks. Your 3D
        model file, its file name, your email, your colour and rush choices, the shop&rsquo;s rates, and anything
        from PayPal are never sent to Anthropic. If a quote could not be sliced, nothing is sent and the built-in
        reviewer writes the notes.
      </p>
      <p>
        By default, Anthropic does not use inputs or outputs from its API to train its models.
        Anthropic keeps what we send and what the model returns for a limited time under its API data retention
        policy, and may keep data longer when that is needed to enforce its usage policies or when the law
        requires it.
      </p>
      <p>
        AI-written notes can be wrong. The notes are informational, not engineering advice, and nothing the AI
        writes changes the estimate. PlateQuote calculates the estimate from the slicing result and the sample
        shop&rsquo;s rates for your selected options.
      </p>

      <h2 id="quotes">Quotes are estimates</h2>
      <ul>
        <li>
          A quote is an estimate from a generic slicing profile (0.20 mm layers, 15% infill, 0.4 mm nozzle). The
          tolerance shown with the quote is the expected spread between this estimate and one from a shop-tuned
          profile.
        </li>
        <li>
          Amounts are shown in US dollars from the sample shop&rsquo;s rates. They show how the software prices a
          job; they are not an offer to print anything.
        </li>
      </ul>

      <h2 id="refunds">No orders, payments, or refunds</h2>
      <ul>
        <li>
          A sandbox checkout charges nothing, so there is nothing to refund. PayPal buyer protection does not
          apply to sandbox transactions, and any dispute raised in the sandbox is a simulation.
        </li>
        <li>
          The shop dashboard can move a test order through states such as paid, printing, and shipped to show how
          a shop would use the software. Those states are part of the demonstration; no part is printed and
          nothing is sent to you.
        </li>
        <li>PayPal handles the sandbox checkout; this site never sees card or bank details.</li>
      </ul>

      <h2 id="use">Acceptable use and your files</h2>
      <ul>
        <li>
          You keep all rights to the file you upload. Upload only files you own or have permission to use, and do
          not upload anything whose use infringes anyone&rsquo;s rights.
        </li>
        <li>
          Do not upload files for firearms or firearm parts and accessories (frames, receivers, magazines,
          auto-sear parts, suppressor or solvent-trap parts), other weapons, counterfeit goods, or anything whose
          manufacture or possession is illegal where we or you are. Do not try to break, overload, or get around
          the limits of the site. We may remove any upload or quote.
        </li>
      </ul>

      <h2 id="privacy">Your files and privacy</h2>
      <p>This site collects as little as it can and sells none of it.</p>
      <ul>
        <li>
          <strong>Uploaded files:</strong> We store uploaded files in our database and keep a temporary copy on
          the web server. We use the files to produce the quote and to derive measurements for printability
          review. Database copies are eligible for deletion after 48 hours and are cleaned up when new files are
          uploaded. Files attached to a test order that completed a sandbox checkout are kept and are not part of
          this cleanup. The web server copy is not deleted on a schedule; it is lost when our host resets the
          server&rsquo;s disk. Until then, a quote link can still show the file.
        </li>
        <li>
          <strong>Quote links</strong> are private addresses. Anyone who has your quote link can see the quote and,
          while it is kept, the uploaded file, so do not share it.
        </li>
        <li>
          <strong>Quote and test order records</strong> (file name, material, colour, quantity, rush choice,
          print purpose, mesh measurements, slicer results, printability and AI review notes, weight, time,
          estimate, test order state, and the PayPal sandbox order and capture IDs) are kept so the
          demonstration can show quotes and test orders. The site does not delete these records, or files kept
          for test orders, on its own. We delete them when you ask us to (see Your rights below).
        </li>
        <li>
          <strong>To and from PayPal:</strong> when you start a sandbox checkout, we send PayPal the sample shop
          name, the quantity, the estimated price, and an internal order number, not your file or its name. A
          sandbox checkout started before these terms took effect may still carry a PayPal description that includes
          the file name. When a sandbox checkout completes and PayPal provides one, we store the email address of
          the PayPal sandbox test account with the test order, until you ask us to delete the record.
          PayPal&rsquo;s sandbox may show us test account details such as a test address; we do not store them. PayPal&rsquo;s privacy statement governs what PayPal collects.
        </li>
        <li>
          <strong>Cookies and tracking:</strong> we run no analytics and no advertising. This site sets one
          cookie, a login cookie for the shop administrator. When you view a priced quote that is still open for a
          sandbox checkout, your browser loads PayPal&rsquo;s checkout code, and PayPal may set its own cookies and collect device data under its
          privacy statement.
        </li>
        <li>
          <strong>Hosting and who receives your data:</strong> the site, its database, and the slicing worker
          run on Render in the United States, which keeps standard server logs including IP addresses. The site
          also holds your IP address in server memory, not in the database, to limit repeated uploads, checkouts,
          and logins. Sandbox
          checkout runs on PayPal. When AI review is on, Anthropic receives the print summary described above and
          nothing else about you or your file. Emails you send us or we send you pass through our email provider.
          We share your data with no one else, except where the law requires it.
        </li>
        <li>
          <strong>Your rights:</strong> email hello@platequote.tech to see, correct, or delete what we hold about
          you or your uploads. We answer within 30 days.
        </li>
        <li>This site is not directed at children, and we do not knowingly collect data from anyone under 13.</li>
      </ul>

      <h2 id="liability">No warranty</h2>
      <p className="font-semibold uppercase">
        This site is a free demonstration. The site, its quotes, and its notes are provided as-is, without any
        warranty, including any implied warranty of merchantability or fitness for a particular purpose. To the
        extent the law allows, we are not liable for any loss arising from your use of the site, including
        indirect or consequential loss.
      </p>
      <p>
        Nothing here limits liability that cannot be limited by law. These terms are governed by the laws of
        Texas, United States, and any dispute is heard in the courts of Bexar County, Texas, except where the law
        of your place of residence gives you the right to a local court.
      </p>

      <h2 id="contact">Contact and changes</h2>
      <p>
        Questions and privacy requests: hello@platequote.tech. Changes to these terms are posted on this page with
        a new effective date.
      </p>
      <p className="text-sm">
        <Link href="/">Back to the quote page</Link>
      </p>
    </article>
  );
}
