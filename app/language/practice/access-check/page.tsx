import { notFound } from "next/navigation";

/** Retired diagnostics stay unavailable in every environment. */
export default function Page() {
  notFound();
}
