import { SALES_EMAIL, salesMailto } from "../sales";

// Explains a forwarded `?demo` link on its own.
export function DemoRibbon() {
  return (
    <aside className="demo-ribbon" aria-label="Sales preview">
      Preview: “Your business here” marks a sponsor’s place, on a stamp for a presenting sponsor and under the envelope
      for a supporting sponsor, and the letter form doesn’t send anything.
      Readers never see this version. To sponsor Letters to Santa, email{" "}
      <a href={salesMailto("Letters to Santa sponsorship")}>{SALES_EMAIL}</a>.
    </aside>
  );
}
