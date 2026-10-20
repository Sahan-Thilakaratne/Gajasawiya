# Human–Elephant Conflict Warning System

**A simple explanation of the project**  
*(Written so anyone can understand it — no technical background needed)*

---

## What is this project?

In many rural parts of Sri Lanka, wild elephants walk near villages and farms. People get hurt. Crops get destroyed. Elephants get killed. This is called **human–elephant conflict**.

Today, people often find out **too late** — when the elephant is already in the field or on the road.

This project is a **phone/computer warning system**. It tries to:

1. Guess **where elephants are likely to be**
2. Warn villages **before** a dangerous meeting
3. Show people a **safer road** to take, instead of walking straight into a high-risk area

It is only **software**. We do not put cameras, sensors, or electric fences in the jungle. Students cannot go and collar wild elephants. So the system uses **public maps, public wildlife records, and realistic computer-made elephant journeys** to prove the idea works.

---

## Why does this matter?

A warning after you see an elephant is not really a warning. It is already an emergency.

If a system can say, *“Tonight this village edge is risky”* or *“Take this other path to town,”* people have time to stay inside, move livestock, or choose a safer route.

This is not a replacement for the Wildlife Department or electric fences. It is an extra **early heads-up** that a student team can actually build and demonstrate.

---

## The big idea in one picture

Think of four helpers working together:

1. **The map of danger** — which land is risky for people and elephants to mix?
2. **The moving elephant (on computer)** — a realistic pretend herd walking across that map
3. **The route finder** — like Google Maps, but it avoids dangerous land
4. **The screen** — a simple map villagers (or examiners) can look at

There is also an **optional extra**: a small sound checker that can tell a calm elephant rumble from an angry trumpet. That is only a bonus for the demo, not the main system.

---

## What we are *not* doing

To keep this honest and possible for university students:

- We are **not** putting GPS collars on Sri Lankan elephants.
- We are **not** hiding microphones in the forest.
- We are **not** claiming we can track every real wild elephant in the country.
- We **are** showing a complete working **model** of how such a warning system could run.

The demo will *look* live (moving elephant on a map, routes changing, alerts popping up). Behind the scenes, the movement is a **carefully built simulation**, not a secret government satellite feed.

---

## How the system works (simple story)

Imagine a farming village near the forest.

**Morning.** The computer already has a coloured map of the area. Green-ish land is safer. Red-ish land is where forest, farms, and people sit too close together. That is where trouble usually happens.

**During the day.** A pretend elephant walks across this map the way real elephants tend to walk: toward water, along forest edges, not through the middle of a city. The computer only “hears” its location once an hour (because real collars also send rare updates to save battery). Between those updates, the computer **estimates** where the animal probably is, and draws a circle of uncertainty.

**If that circle touches the village.** The app raises an alert.

**If someone needs to go to town.** The app does not only show the shortest road. It shows a road that **goes around** the red zones, even if it is a bit longer.

That is the whole product.

---

## The four main parts

### Part 1 — The danger map

**Everyday name:** “Where are people and elephants likely to clash?”

**What it does**  
It colours the country (or one district, for the student demo) by risk.

High risk is **not** “there is forest.” Empty forest far from people is not the main problem. High risk is:

- forest next to farms
- water sources near villages
- many people living on the edge of elephant country

**Where the information comes from** (all free, no field trip required)

- Wildlife sightings that people already uploaded online (citizen science)
- Public maps of forest, farms, roads, rivers, and villages
- Public maps of how many people live in each area
- Weather records (rain and season change how animals move)
- Height of the land (hills vs flat land)

**How we teach the computer**  
We show it places where elephants have been seen, and ordinary other places. It learns patterns: *elephants like this kind of land; conflict is worse when people are also there.*

**What comes out**  
A heat map: each small square of land gets a score from **low danger** to **high danger**.

**What is new / interesting about this part**  
Many maps only say “elephants live in the forest.” We treat conflict as a **mix of two things**: good land for elephants **and** people living or farming there. We can also explain in plain words *why* a square is red: “farm + village + forest edge.”

---

### Part 2 — The moving elephant (pretend, but realistic)

**Everyday name:** “Follow the animal even when we only get a location once in a while.”

**The real-world problem**  
If an elephant wore a GPS collar, the collar would not send a location every second. Batteries die. So you might get a ping every hour. For that whole hour you would not know exactly where the herd is. That empty hour is dangerous.

**What we do instead of real collars**  
We **create** an elephant journey on the Sri Lankan map.

We do this carefully:

- We look at a **public** elephant-tracking study from another country (South Africa) only to learn typical walking speeds and turning habits. We always say this is not Sri Lankan government data.
- We then let our pretend elephant walk on **Sri Lankan** land: attracted to water and forest, avoiding busy towns.

The computer saves the **true** path (because we made it). Then it pretends to be a weak collar: it only reveals the location once an hour. A mathematical tracker fills in the gaps and draws a **circle**: “the animal is probably somewhere in here.”

**What comes out**  
- a moving point on the map  
- a growing/shrinking circle of “we’re not sure exactly”  
- a warning if that circle overlaps a village or paddy field

**What is new / interesting about this part**  
Students cannot borrow real Sri Lankan collars. So the contribution is: **a fair test**. Because we created the path, we can check whether the tracker’s guess was close. With real hourly collars, nobody knows the true in-between path. With our method, we do.

---

### Part 3 — The safe-road finder

**Everyday name:** “Don’t take the shortcut through the danger zone.”

**What it does**  
It uses ordinary road maps (the same kind of map data that sits behind many public maps).

Normally a map app asks: *which road is shortest?*  
Our app also asks: *which road is safer given today’s danger map and the elephant’s circle?*

A road that cuts through a red farm-forest edge becomes “expensive,” like a road with heavy traffic. The computer then prefers a detour.

If the elephant’s uncertainty circle sits on a road, that road is treated as even worse for a while.

**What comes out**  
- a safer path (maybe a bit longer)  
- a comparison: “shortest vs safer”  
- village alerts if the animal’s circle enters the settlement

**What is new / interesting about this part**  
The roads are not fixed. They **change meaning** as risk changes. Evening can be treated as more dangerous than midday, because elephants often move more at dusk and dawn. The map is not a static poster; it reacts.

---

### Part 4 — The screen people see

**Everyday name:** “The map app.”

This is the simple front:

- coloured danger layer
- elephant marker
- uncertainty circle
- two routes (shortest and safer)
- a big alert if a village is in danger

For a university demo, a **website map** is enough. A phone app is nice extra, not required to prove the idea.

When we present it, a small program plays the pretend journey step by step so it looks live. We will say that openly. The point of the demo is to show the full chain working, not to pretend we own a satellite.

---

## Optional extra — Elephant sounds

Some people expect an “AI listening” piece.

If we include it, it is a **small bonus**:

- We take recorded elephant rumbles and trumpets (already available as small files)
- We mix them with rain, wind, and insect noise
- A ready-made sound tool (not a giant custom brain we trained from zero) learns: *calm call vs angry/alarm call*

A trumpet can slightly raise danger **near a simulated village**, as if someone sent a phone recording.

This is **not** how we map the whole country. We cannot listen to the real jungle without microphones in the field. We say that clearly.

---

## How the four parts talk to each other

1. Part 1 builds the danger colouring of the land.  
2. Part 2 moves the elephant and estimates a circle.  
3. Part 3 uses both of those to pick safer roads and to raise village alarms.  
4. Part 4 shows it.

Nothing works alone. The research story is this **chain**, from open information to a warning a person can use.

---

## What makes this a research project (not only a student app)

A non-technical way to say it:

| Part | Ordinary work | The interesting idea |
|---|---|---|
| Danger map | Collecting public maps | Conflict happens where **elephants and people overlap**, and we can explain why a place is risky |
| Moving elephant | A moving icon on a map | A realistic journey plus a tracker that works with **rare** location updates — and we can measure if the guess was good |
| Safe roads | Drawing a path | Roads become safer or more dangerous as the situation changes |
| Screen | A map | Lets people *use* the result; this part is the product, not the scientific claim |

We will not claim we have solved HEC in Sri Lanka. We claim we built a **clear, testable warning-and-routing method** that does not need jungle hardware or secret government collars.

---

## What we will admit (this is a strength, not a weakness)

Good projects tell the truth about limits.

- Online sightings are biased: people record elephants where *people* go, not in the deep forest.
- A computer-made journey is not a real named herd in Anuradhapura.
- Walking habits copied from another country’s elephants are only a **rough guide**.
- The live demo is a playback of that journey.

We still get a full system: maps, prediction, alerts, and safer routes — which is what a university panel can mark.

---

## What success looks like at the end

For the demonstration we should be able to show:

1. A coloured risk map of a Sri Lankan district.  
2. An elephant moving, with a circle of uncertainty.  
3. The circle hitting a village → an alert.  
4. Two roads: the short one and the safer one.  
5. A short explanation: “this detour exists because of farms on the forest edge.”

If a supervisor or a villager can watch that and understand it, the project has done its job.

---

## In one short paragraph

Wild elephants and rural people in Sri Lanka often meet with tragic results. This project builds a computer warning system that colours risky land, follows a realistic (computer-made) elephant when location updates are rare, warns a village if danger gets close, and suggests a safer road around the problem. It uses public maps and wildlife records instead of jungle cameras or official collars, so university students can actually build it. The aim is not to replace wildlife officers. The aim is to show that **early, map-based warnings and safer routes** are possible without putting hardware in the forest.
