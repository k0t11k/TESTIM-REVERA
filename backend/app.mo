import Principal "mo:base/Principal";
import HashMap "mo:base/HashMap";
import Text "mo:base/Text";
import Nat "mo:base/Nat";
import Bool "mo:base/Bool";
import Array "mo:base/Array";
import Option "mo:base/Option";
import Iter "mo:base/Iter";
import Time "mo:base/Time";
import Buffer "mo:base/Buffer";

// Ledger for ICP transfers (simplified for test)
// import Ledger "canister:icp_ledger_canister"; // Comment for local test

actor RevEraICP {
  // Data structures
  type Event = {
    id: Nat;
    name: Text;
    date: Text; // e.g., "2025-08-25"
    city: Text;
    category: Text; // "Concerts", "Theaters", etc.
    priceICP: Nat; // in e8s (1 ICP = 10^8 e8s)
    organizer: Principal;
    description: Text;
    image: Text; // URL placeholder
    approved: Bool;
  };

  type User = {
    principal: Principal;
    email: ?Text;
    referralLink: Text; // Unique like "/ref/<principal>"
  };

  type NFTTicket = {
    id: Nat;
    eventId: Nat;
    owner: Principal;
    metadata: Text; // JSON-like for ticket details
    transferable: Bool; // False for soulbound
  };

  stable var eventIdCounter: Nat = 0;
  stable var ticketIdCounter: Nat = 0;
  let events = HashMap.HashMap<Nat, Event>(0, Nat.equal, Nat.hash);
  let pendingEvents = HashMap.HashMap<Nat, Event>(0, Nat.equal, Nat.hash);
  let users = HashMap.HashMap<Principal, User>(0, Principal.equal, Principal.hash);
  let tickets = HashMap.HashMap<Nat, NFTTicket>(0, Nat.equal, Nat.hash);
  let admins = Buffer.Buffer<Principal>(1);
  let defaultAdmin = Principal.fromText("2vxsx-fae"); // Замени на свой: dfx identity get-principal

  ignore admins.add(defaultAdmin); // Init admin

  // Auth with II (caller is principal)
  public shared(msg) func login() : async Text {
    let caller = msg.caller;
    if (users.get(caller) == null) {
      let refLink = "/ref/" # Principal.toText(caller);
      users.put(caller, {principal = caller; email = null; referralLink = refLink});
    };
    "Logged in as " # Principal.toText(caller);
  };

  // Create event (submit for verification)
  public shared(msg) func createEvent(name: Text, date: Text, city: Text, category: Text, priceICP: Nat, description: Text, image: Text) : async Nat {
    let caller = msg.caller;
    let id = eventIdCounter;
    eventIdCounter += 1;
    let event: Event = {id; name; date; city; category; priceICP; organizer = caller; description; image; approved = false};
    pendingEvents.put(id, event);
    id;
  };

  // Admin functions
  public shared(msg) func isAdmin() : async Bool {
    let caller = msg.caller;
    Array.find<Principal>(Buffer.toArray(admins), func(p) { p == caller }) != null;
  };

  public shared(msg) func addAdmin(newAdmin: Principal) : async () {
    if (await isAdmin()) {
      admins.add(newAdmin);
    };
  };

  public shared(msg) func approveEvent(eventId: Nat, approve: Bool, editName: ?Text) : async Bool { // Simple edit example
    if (await isAdmin()) {
      switch (pendingEvents.get(eventId)) {
        case (?event) {
          if (approve) {
            var newEvent = event;
            switch (editName) {
              case (?n) { newEvent := {event with name = n}; };
              case null {};
            };
            events.put(eventId, {newEvent with approved = true});
            ignore pendingEvents.remove(eventId);
            true;
          } else {
            ignore pendingEvents.remove(eventId);
            false;
          };
        };
        case null { false };
      };
    } else { false };
  };

  // Get events (query with filters)
  public query func getEvents(cityFilter: ?Text, dateFilter: ?Text, categoryFilter: ?Text) : async [Event] {
    let filtered = Buffer.Buffer<Event>(0);
    for ((_, event) in events.entries()) {
      if (event.approved and
          (Option.isNull(cityFilter) or event.city == Option.unwrap(cityFilter)) and
          (Option.isNull(dateFilter) or event.date == Option.unwrap(dateFilter)) and
          (Option.isNull(categoryFilter) or event.category == Option.unwrap(categoryFilter))) {
        filtered.add(event);
      };
    };
    Buffer.toArray(filtered);
  };

  // Buy ticket (pay ICP, mint NFT)
  public shared(msg) func buyTicket(eventId: Nat) : async Nat {
    let caller = msg.caller;
    switch (events.get(eventId)) {
      case (?event) {
        if (event.approved) {
          // Simulate ICP transfer (uncomment for mainnet: await Ledger.transfer({to = Principal.fromText("canister-principal"); amount = {e8s = event.priceICP}; memo = 0; fee = {e8s = 10000};}));
          let ticketId = ticketIdCounter;
          ticketIdCounter += 1;
          let ticket: NFTTicket = {id = ticketId; eventId; owner = caller; metadata = "Ticket for " # event.name; transferable = false};
          tickets.put(ticketId, ticket);
          ticketId;
        } else { 0 };
      };
      case null { 0 };
    };
  };

  // Get referral link
  public query(msg) func getReferralLink() : async ?Text {
    switch (users.get(msg.caller)) {
      case (?u) { ?u.referralLink };
      case null { null };
    };
  };

  // Categories default
  public query func getCategories() : async [Text] {
    ["Concerts", "Theaters", "Festivals", "Sports", "Seminars"];
  };

  // Admin panel: get pending
  public query func getPendingEvents() : async [Event] {
    let buf = Buffer.Buffer<Event>(0);
    for ((_, e) in pendingEvents.entries()) { buf.add(e); };
    Buffer.toArray(buf);
  };

  // Organizer contact: just return organizer principal/email if set
  public query func getOrganizer(eventId: Nat) : async ?Principal {
    switch (pendingEvents.get(eventId)) {
      case (?e) { ?e.organizer };
      case null { switch (events.get(eventId)) { case (?e) { ?e.organizer }; case null { null }; } };
    };
  };
};