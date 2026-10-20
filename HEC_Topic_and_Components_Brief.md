# Human–Elephant Conflict Warning System
## Topic and four components — brief plain-English guide

---

## What is this topic about?

In rural Sri Lanka, wild elephants often come close to villages and farms. People get hurt, crops are destroyed, and elephants are killed. This is called **human–elephant conflict (HEC)**.

Most warnings today come **too late** — when someone has already seen an elephant nearby.

This project builds a **computer warning system** that tries to:

- show **where** conflict is likely
- **guess where an elephant might be moving**, even when we only get a location once in a while
- **warn a village** if danger gets close
- suggest a **safer road** that goes around risky land

It uses **only software** — no cameras or sensors in the jungle, and no putting collars on real elephants. Public maps and wildlife records are used instead, plus a realistic **computer-made elephant journey** for testing.

---

## The four components

### Component 1 — The danger map

**What it does**  
Colours the land from **low risk** to **high risk**.

High risk is not just “there is forest.” It is where **elephants are likely to be** and **people live or farm** at the same time — forest edges, farms, villages near water.

**Novelty (why it is new)**  
Most simple maps only ask: *Where do elephants live?*  
This map asks: *Where could elephants and people actually meet?*  
It also explains **why** a place is risky (e.g. “farm + village + forest edge”).

---

### Component 2 — Following the elephant (between rare updates)

**What it does**  
Real GPS collars do not send a location every second — often only **once an hour**. For that whole hour, nobody knows exactly where the animal is.

This part **creates a realistic elephant path on the map**, then pretends to receive only hourly updates. The computer **fills in the gap** and draws a circle: *“The elephant is probably somewhere in here.”*

**Novelty (why it is new)**  
With real collars, you never know the true path between pings, so you cannot properly test the tracker. Here, because the path is computer-made, we **can measure how good the guess is**. That is a fair, honest way to study early warning without government collar data.

---

### Component 3 — The safe-road finder

**What it does**  
Like a map app, but it does not only show the **shortest** road. It shows a **safer** road that avoids red (high-risk) areas — even if it is a bit longer.

If the elephant’s uncertainty circle touches a village or a risky road, that area is treated as more dangerous and the route changes.

**Novelty (why it is new)**  
The map is **not fixed**. Roads become more or less “costly” as risk and the elephant’s estimated position change. The system turns a wildlife problem into something a person can **act on**: *take this other path*.

---

### Component 4 — The screen people see

**What it does**  
A simple map showing:

- coloured danger areas
- the estimated elephant and its uncertainty circle
- shortest route vs safer route
- an alert if a village is in danger

For the university demo, the movement is **played back** step by step so it looks live. This is clearly labelled as a research demonstration, not an official government warning service.

**Novelty (why it is new)**  
The first three parts are linked into **one story** a villager or examiner can watch and understand in a few minutes — not four separate student exercises.

---

## Optional extra (not one of the four main parts)

A small **sound checker** can tell a calm elephant rumble from an angry trumpet using public recordings mixed with rain and wind noise. It is only a **bonus demo**, not how the whole country is mapped.

---

## In one sentence

We map where people and elephants are likely to clash, follow a simulated elephant when location updates are rare, warn villages if danger gets close, and show a safer road — all using public data and honest computer simulation, without jungle hardware.

---

## What we honestly do not claim

- We do not track every real wild elephant in Sri Lanka.
- We do not replace the Wildlife Department or electric fences.
- The moving elephant in the demo is **simulated**, not a live satellite feed.

These limits are stated openly. The value is a **complete, testable warning idea** that university students can actually build.
