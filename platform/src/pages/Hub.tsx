/* P0 placeholder: proves the token system, card anatomy, and routing.
   Phase P2 replaces the static course list with the live catalog + the
   visitor's own progress. */
const COURSES = [
  {
    href: "/",
    title: "JavaScript Concurrency Bootcamp",
    tagline: "single thread, many turns",
    description:
      "The event loop up through primitives, workers & atomics, durable execution, and a scored test mode."
  },
  {
    href: "/distributed-systems/",
    title: "Distributed Systems Bootcamp",
    tagline: "many nodes, no shared clock",
    description:
      "Clocks, quorums, consensus, and delivery guarantees — drilled against a simulated cluster."
  }
];

export default function Hub() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <header className="mb-10 text-center">
        <p className="text-sm font-medium uppercase tracking-widest text-primary-600">
          Ready, Set, Cloud!
        </p>
        <h1 className="mt-2 text-3xl font-bold text-foreground sm:text-4xl">Courses</h1>
        <p className="mt-3 text-muted-foreground">
          Hands-on, tap-driven bootcamps. Free, offline-friendly, and your
          progress follows you across devices when you sign in.
        </p>
      </header>

      <section aria-label="course catalog" className="grid gap-5">
        {COURSES.map((course) => (
          <a
            key={course.href}
            href={course.href}
            className="card block transition-shadow hover:shadow-medium focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <div className="card-body">
              <div className="flex items-baseline justify-between gap-4">
                <h2 className="text-lg font-semibold text-foreground">{course.title}</h2>
                <span className="shrink-0 font-mono text-xs text-muted-foreground">
                  // {course.tagline}
                </span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{course.description}</p>
            </div>
          </a>
        ))}
      </section>

      <footer className="mt-12 text-center text-sm text-muted-foreground">
        a{" "}
        <a
          href="https://readysetcloud.io"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-primary-600 hover:text-primary-700"
        >
          Ready, Set, Cloud!
        </a>{" "}
        project
      </footer>
    </main>
  );
}
