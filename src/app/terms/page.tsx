import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms, refunds, and privacy | PlateQuote",
  description: "How PlateQuote quotes, charges, refunds, and handles your files.",
};

const EFFECTIVE = "November 23, 2026";

export default function TermsPage() {
  return (
    <article className="legal mx-auto max-w-3xl">
      <h1 className="font-heading">Terms, refunds, and privacy</h1>
      <p className="text-sm text-muted-foreground">Effective {EFFECTIVE}. Plain language on purpose.</p>

      <nav aria-label="Sections" className="text-sm">
        <a href="#who">Who runs this site</a> · <a href="#service">What PlateQuote does</a> ·{" "}
        <a href="#pricing">Quotes and pricing</a> · <a href="#payment">Payment</a> ·{" "}
        <a href="#refunds">Refunds and cancellations</a> · <a href="#parts">Printed parts</a> ·{" "}
        <a href="#privacy">Your files and privacy</a> · <a href="#liability">Liability</a> ·{" "}
        <a href="#contact">Contact</a>
      </nav>

      <h2 id="who">Who runs this site</h2>
      <p>
        PlateQuote at platequote.tech is operated by Christopher Espinoza, doing business as PlateQuote, a sole
        proprietor in San Antonio, Texas, United States. Mailing address: 21750 Hardy Oak Blvd Ste 104, PMB 532333,
        San Antonio, Texas 78258-4946. Email: hello@platequote.tech. &ldquo;We&rdquo; and &ldquo;the operator&rdquo;
        below mean this business.
      </p>
      <p>
        Northline Print is the sample shop name built into this software. On platequote.tech, checkout runs in
        PayPal&rsquo;s sandbox: no real money moves, and nothing paid here is printed or shipped.
      </p>
      <p>
        PlateQuote sells to customers in the United States only. Orders from elsewhere may be declined and
        refunded in full.
      </p>
      <p>
        A second copy of this site runs at platequote-web.onrender.com. Checkout there also uses the PayPal
        sandbox: no money moves, and nothing paid there is printed or shipped.
      </p>

      <h2 id="service">What PlateQuote does</h2>
      <p>
        You upload a 3D model (STL or 3MF). The site slices it with a generic printer profile, prices the result
        from the shop&rsquo;s posted rates, and lets you pay with PayPal. The printability notes and material
        advice on a quote are written either by a built-in reviewer on our server or, when AI review is on, by
        Anthropic&rsquo;s Claude AI model. The badge on the notes says which one wrote them (&ldquo;Built-in
        review&rdquo; or &ldquo;AI review · Claude&rdquo;).
      </p>
      <p>
        When AI review is on, we send Anthropic a short summary of the print, not your model file. The summary
        contains exactly these items. From the mesh: its size (bounding box), volume, surface area, overhang
        share and the overhang angle threshold used to measure it, wall thickness and a thin-wall flag, triangle
        count, part count, whether it is watertight, whether it fits the printer bed, and whether it would fit if
        rotated. From the slicer estimate: grams, filament volume, print time, whether supports are needed, the
        profile name, and the slicer name. From your choices: the material, quantity, and purpose you picked.
        From the shop: the printer&rsquo;s bed size and the names of the materials the shop stocks. Your 3D
        model file, its file name, your email, your colour and rush choices, the shop&rsquo;s rates, and your
        payment and shipping details are never sent to Anthropic. If a quote could not be sliced, nothing is
        sent and the built-in reviewer writes the notes.
      </p>
      <p>
        By default, Anthropic does not use inputs or outputs from its API to train its models.
        Under Anthropic&rsquo;s API data retention policy, the standard retention period is 30 days for both
        what we send and what the model returns. Anthropic may keep data longer when that is needed to enforce
        its usage policies or when the law requires it.
      </p>
      <p>
        AI-written notes can be wrong. Use the amount shown at checkout. PlateQuote calculates that amount from
        the slicing estimate and the shop&rsquo;s rates for your selected options. The notes are informational,
        not engineering advice, and nothing the AI writes changes what you pay.
      </p>
      <p>By paying for an order you agree to these terms. If you do not agree, do not place an order.</p>

      <h2 id="pricing">Quotes and pricing</h2>
      <ul>
        <li>
          A quote is an estimate from a generic slicing profile (0.20 mm layers, 15% infill, 0.4 mm nozzle). The
          tolerance shown with the quote is the expected spread between the estimate and the actual print.
        </li>
        <li>
          The price you pay at checkout is the final price for that order. We do not charge more after payment,
          even if the actual print uses more material or time than estimated.
        </li>
        <li>Prices are in US dollars. Shipping within the United States is included; there is no separate shipping charge.</li>
        <li>A quote that has not been paid can change or expire at any time.</li>
      </ul>

      <h2 id="payment">Payment</h2>
      <ul>
        <li>Payment is by PayPal only. PayPal handles your card or bank details; this site never sees them.</li>
        <li>
          Your payment is captured when you approve it at PayPal. An order is confirmed when the quote page shows
          it as paid.
        </li>
        <li>You must be 18 or older to order. This site is not for children under 13.</li>
        <li>
          PayPal&rsquo;s own purchase protection and dispute process apply in addition to the refund terms below,
          and nothing here limits them.
        </li>
      </ul>

      <h2 id="refunds">Refunds and cancellations</h2>
      <p>Printed parts are made to order from your file, so refunds follow the state of the job:</p>
      <ul>
        <li>
          <strong>Before printing starts:</strong> cancel for a full refund. Email hello@platequote.tech with your
          quote link. Printing has not started until your quote page shows the order as Printing.
        </li>
        <li>
          <strong>After printing starts:</strong> material and machine time are already spent. We may refund part
          of the price at our discretion, and we will say what was spent.
        </li>
        <li>
          <strong>Defective, damaged, or not as sliced:</strong> email within 14 days of the shipped date shown on your order, with photos. We
          reprint at no charge or refund in full, your choice.
        </li>
        <li>
          <strong>We cannot fulfil the order</strong> (printer down, material out, the file will not print): full
          refund, no questions.
        </li>
      </ul>
      <p>
        Refunds go back through PayPal to the payment method you used. We issue an agreed refund within 10 business
        days; PayPal and your bank decide when it posts. We do not refund in cash or to a different account.
      </p>
      <p>
        Nothing in this section removes rights you have under the consumer law of the place you live, where that
        law applies to this order.
      </p>

      <h2 id="parts">Printed parts</h2>
      <ul>
        <li>
          You keep all rights to the file you upload. You confirm that you own it or have permission to have it
          printed, and that printing it does not infringe anyone&rsquo;s rights.
        </li>
        <li>
          We do not print firearms or firearm parts and accessories (frames, receivers, magazines, auto-sear
          parts, suppressor or solvent-trap parts), other weapons, counterfeit goods, or anything whose
          manufacture or possession is illegal where we or you are. We look at every paid file before printing
          and may decline it and refund in full.
        </li>
        <li>
          Parts are hobby-grade FDM prints made as-is from your file in the material you chose. They are not
          certified for food contact, medical, structural, load-bearing, or other safety-critical use. Dimensions
          follow your file, the material&rsquo;s shrinkage, and the generic profile.
        </li>
        <li>
          We ship within the United States only. If we cannot ship within 30 days of payment, we email you with
          the choice of waiting or a full refund. Risk of loss passes to you when the carrier accepts the
          package; a tracking number is added to your order when one exists.
        </li>
      </ul>

      <h2 id="privacy">Your files and privacy</h2>
      <p>This site collects as little as it can and sells none of it.</p>
      <ul>
        <li>
          <strong>Uploaded files:</strong> We store uploaded files in our database and keep a temporary copy on
          the web server. We use the files to slice and fulfill orders and to derive measurements for
          printability review. Unpaid database copies are eligible for deletion after 48 hours and are cleaned
          up when new files are uploaded. This cleanup excludes files for paid orders.
        </li>
        <li>
          <strong>Quote links</strong> are private addresses. Anyone who has your quote link can see the uploaded
          file and the quote, so do not share it.
        </li>
        <li>
          <strong>Quote and order records</strong> (file name, material, colour, quantity, weight, time, price,
          order status) are kept so we can fulfil and support orders and keep tax records.
        </li>
        <li>
          <strong>From PayPal</strong>, after you pay, we store your PayPal email address with the order. Your
          name and shipping address are shown to us in PayPal, and we use them only to ship the order and keep
          sales records. PayPal&rsquo;s privacy statement governs what PayPal collects.
        </li>
        <li>
          <strong>Cookies and tracking:</strong> we run no analytics and no advertising. This site sets one
          cookie, a login cookie for the shop administrator. When you open checkout, your browser loads
          PayPal&rsquo;s checkout code, and PayPal may set its own cookies and collect device data under its
          privacy statement.
        </li>
        <li>
          <strong>Hosting and who receives your data:</strong> the site, its database, and the slicing worker
          run on Render in the United States, which keeps standard server logs including IP addresses. Payments
          run on PayPal. When AI review is on, Anthropic receives the print summary described above and nothing
          else about you or your file. Your name and shipping address go to the shipping carrier on the label,
          and emails you send us or we send you pass through our email provider. We share your data with no one
          else, except where the law requires it.
        </li>
        <li>
          <strong>Your rights:</strong> email hello@platequote.tech to see, correct, or delete what we hold about
          you or your order. We answer within 30 days. We keep records that tax law requires us to keep.
        </li>
        <li>This site is not directed at children, and we do not knowingly collect data from anyone under 13.</li>
      </ul>

      <h2 id="liability">Liability</h2>
      <p className="font-semibold uppercase">
        The site, its quotes, and printed parts are provided as-is, without any implied warranty of
        merchantability or fitness for a particular purpose, except the reprint-or-refund promise above. To the
        extent the law allows, our total liability for any order is limited to the amount you paid for it, and we
        are not liable for indirect or consequential loss.
      </p>
      <p>
        Nothing here limits liability that cannot be limited by law, including for death or personal injury.
        These terms are governed by the laws of Texas, United States, and any dispute is heard in the courts of
        Bexar County, Texas, except where the law of your place of residence gives you the right to a local court.
      </p>

      <h2 id="contact">Contact and changes</h2>
      <p>
        Questions, cancellations, and refund requests: hello@platequote.tech. Changes to these terms are posted on
        this page with a new effective date; the terms in force when you paid govern that order.
      </p>
      <p className="text-sm">
        <Link href="/">Back to the quote page</Link>
      </p>
    </article>
  );
}
