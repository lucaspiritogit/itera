# Ubiquitous Language

## Session control flow

| Term                     | Definition                                                                                                   | Aliases to avoid                  |
| ------------------------ | ------------------------------------------------------------------------------------------------------------ | --------------------------------- |
| **Session**              | A single interactive stateful conversation between the desktop app and an agent runtime.                     | Thread, chat loop                 |
| **Turn**                 | One agent execution cycle that starts from a user/review prompt and ends when output is complete or stopped. | Run, request                      |
| **Active Turn**          | A turn currently executing and still producing progress or output.                                           | Busy state, in-flight             |
| **Session Mode**         | The intent context for the session, currently either exploration or editing.                                 | Screen mode, tab mode             |
| **Lifecycle Controller** | The component that decides when a session should connect or disconnect based on session inputs.              | Connection effect, reconnect hook |

## Review and exploration workflow

| Term                    | Definition                                                                                            | Aliases to avoid          |
| ----------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------- |
| **Exploration Finding** | A structured candidate change location identified during exploration and awaiting developer decision. | Suggestion, hint          |
| **Review Batch**        | A grouped set of file change cards presented for decision as one review unit.                         | Diff list, patch set      |
| **Review Card**         | One file-level change item within a review batch.                                                     | Hunk, file diff           |
| **Review Decision**     | The explicit developer disposition for a review card: accepted, denied, or pending.                   | Approval state, vote      |
| **Pending Decision**    | A required review or finding decision that blocks normal send flow.                                   | Blocker, unresolved state |

## Architecture boundaries

| Term                | Definition                                                                                           | Aliases to avoid         |
| ------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------ |
| **Policy**          | A deterministic rule set that maps normalized input and gate state to domain commands.               | Handler, UI logic        |
| **Port**            | A stable boundary contract used by the policy/controller layer without runtime specifics.            | API call, implementation |
| **Adapter**         | A runtime-specific translator that converts framework events or commands to and from port contracts. | Wrapper, glue code       |
| **Gate State**      | The minimal session facts required by policy to decide whether commands are allowed.                 | Snapshot, full state     |
| **Runtime Command** | A typed action emitted by policy to be executed by an adapter against orchestration/UI boundaries.   | Side effect, callback    |

## Relationships

- A **Session** has many **Turns**.
- A **Session** has exactly one current **Session Mode**.
- A **Turn** can be an **Active Turn** at most once at a time.
- An **Exploration Finding** belongs to one **Session** and can create a **Pending Decision**.
- A **Review Batch** contains one or more **Review Cards**.
- A **Review Card** has exactly one current **Review Decision**.
- Any **Pending Decision** blocks standard prompt sending in the **Session**.
- A **Policy** consumes **Gate State** and emits **Runtime Commands**.
- A **Port** defines the contract that **Adapters** implement.

## Example dialogue

> **Dev:** "When the user presses Enter with Cmd, should the **Policy** always accept?"
>
> **Domain expert:** "Only if **Gate State** says there is a pending **Review Card** or **Exploration Finding** decision."
>
> **Dev:** "So the **Policy** emits a **Runtime Command**, and an **Adapter** calls session methods?"
>
> **Domain expert:** "Exactly. The **Port** stays stable; only the **Adapter** changes if we swap runtimes."
>
> **Dev:** "And while there is a **Pending Decision**, normal send stays blocked for the **Session**?"
>
> **Domain expert:** "Yes, until that decision is resolved."
