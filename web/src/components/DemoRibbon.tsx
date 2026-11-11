import { SALES_EMAIL, salesMailto } from "../sales";

// Explains a forwarded `?demo` link on its own.
export function DemoRibbon() {
  return (
    <aside className="demo-ribbon" aria-label="Sales preview">
      Preview: the presenting sponsor’s stamp shows “Your business here,” and the letter form doesn’t send anything.
      Readers never see this version. To sponsor Letters to Santa, email{" "}
      <a href={salesMailto("Letters to Santa sponsorship")}>{SALES_EMAIL}</a>.
    </aside>
  );
}
