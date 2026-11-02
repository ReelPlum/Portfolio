//! A tiny line-based calculator language, to show how a WASI program runs on the site.
//!   let x = 2 * (3 + 4)
//!   print x / 2
use std::collections::HashMap;
use std::{env, fs, process};

fn main() {
    let path = env::args().nth(1).unwrap_or_else(|| {
        eprintln!("usage: tiny-calc <file>");
        process::exit(2)
    });
    let src = fs::read_to_string(&path).unwrap_or_else(|e| {
        eprintln!("cannot read {path}: {e}");
        process::exit(2)
    });
    let mut vars = HashMap::new();
    for (n, line) in src.lines().enumerate() {
        let line = line.split('#').next().unwrap().trim();
        if line.is_empty() { continue; }
        if let Err(e) = exec(line, &mut vars) {
            eprintln!("line {}: {e}", n + 1);
            process::exit(1);
        }
    }
}

fn exec(line: &str, vars: &mut HashMap<String, f64>) -> Result<(), String> {
    if let Some(rest) = line.strip_prefix("let ") {
        let (name, expr) = rest.split_once('=').ok_or("expected '=' after let")?;
        let v = eval(expr, vars)?;
        vars.insert(name.trim().to_string(), v);
    } else if let Some(rest) = line.strip_prefix("print ") {
        let rest = rest.trim();
        if let Some(s) = rest.strip_prefix('"').and_then(|r| r.strip_suffix('"')) {
            println!("{s}");
        } else {
            println!("{}", eval(rest, vars)?);
        }
    } else {
        return Err(format!("unknown statement: {line}"));
    }
    Ok(())
}

fn eval(src: &str, vars: &HashMap<String, f64>) -> Result<f64, String> {
    let toks: Vec<char> = src.chars().filter(|c| !c.is_whitespace()).collect();
    let mut p = Parser { t: &toks, i: 0, vars };
    let v = p.expr()?;
    if p.i != toks.len() { return Err(format!("unexpected '{}'", toks[p.i])); }
    Ok(v)
}

struct Parser<'a> { t: &'a [char], i: usize, vars: &'a HashMap<String, f64> }

impl Parser<'_> {
    fn peek(&self) -> Option<char> { self.t.get(self.i).copied() }
    fn expr(&mut self) -> Result<f64, String> {
        let mut v = self.term()?;
        while let Some(c @ ('+' | '-')) = self.peek() {
            self.i += 1;
            let r = self.term()?;
            v = if c == '+' { v + r } else { v - r };
        }
        Ok(v)
    }
    fn term(&mut self) -> Result<f64, String> {
        let mut v = self.atom()?;
        while let Some(c @ ('*' | '/')) = self.peek() {
            self.i += 1;
            let r = self.atom()?;
            if c == '/' && r == 0.0 { return Err("division by zero".into()); }
            v = if c == '*' { v * r } else { v / r };
        }
        Ok(v)
    }
    fn atom(&mut self) -> Result<f64, String> {
        match self.peek() {
            Some('(') => {
                self.i += 1;
                let v = self.expr()?;
                if self.peek() != Some(')') { return Err("expected ')'".into()); }
                self.i += 1;
                Ok(v)
            }
            Some('-') => { self.i += 1; Ok(-self.atom()?) }
            Some(c) if c.is_ascii_digit() || c == '.' => {
                let s = self.i;
                while matches!(self.peek(), Some(c) if c.is_ascii_digit() || c == '.') { self.i += 1; }
                self.t[s..self.i].iter().collect::<String>().parse().map_err(|_| "bad number".into())
            }
            Some(c) if c.is_alphabetic() => {
                let s = self.i;
                while matches!(self.peek(), Some(c) if c.is_alphanumeric() || c == '_') { self.i += 1; }
                let name: String = self.t[s..self.i].iter().collect();
                self.vars.get(&name).copied().ok_or(format!("unknown variable '{name}'"))
            }
            Some(c) => Err(format!("unexpected '{c}'")),
            None => Err("unexpected end of line".into()),
        }
    }
}
