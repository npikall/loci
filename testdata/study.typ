#import "@local/loci:0.1.0": mc, q, sc

#mc("Which are fruits?", ok: ("apple", "pear"), err: ("carrot"))

#sc([Which equals $2^3$?], ok: "8", err: ("6", "9"), n: 7)

#for a in range(2, 4) {
  q("What is " + str(a) + " squared?")[The answer is #(a * a).]
}

#sc("Which is a noble gas?", ok: "Neon", err: "Iron", hint: [Glows in signs.], why: [Group 18.])
