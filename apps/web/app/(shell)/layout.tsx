import { Nav } from "@/components/nav";

export default function ShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Nav />
      <main className="w-full">{children}</main>
    </>
  );
}
