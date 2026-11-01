//! Turns source text into tokens. The parser never sees characters, only these.

#[derive(Debug, Clone, PartialEq)]
pub enum Token {
    Number(f64),
    Ident(String),
    Str(String),
    Let,
    Print,
    Op(char),
    LParen,
    RParen,
    Eof,
}

pub struct Lexer<'a> {
    chars: std::iter::Peekable<std::str::Chars<'a>>,
    line: usize,
}

impl<'a> Lexer<'a> {
    pub fn new(src: &'a str) -> Self {
        Lexer { chars: src.chars().peekable(), line: 1 }
    }

    pub fn next_token(&mut self) -> Result<Token, String> {
        while let Some(&c) = self.chars.peek() {
            if c == '\n' {
                self.line += 1;
            }
            if !c.is_whitespace() {
                break;
            }
            self.chars.next();
        }
        let Some(c) = self.chars.next() else { return Ok(Token::Eof) };
        match c {
            '0'..='9' => Ok(Token::Number(self.number(c)?)),
            'a'..='z' | 'A'..='Z' | '_' => Ok(self.word(c)),
            '"' => self.string(),
            '(' => Ok(Token::LParen),
            ')' => Ok(Token::RParen),
            '+' | '-' | '*' | '/' | '=' => Ok(Token::Op(c)),
            other => Err(format!("line {}: unexpected character '{other}'", self.line)),
        }
    }

    fn number(&mut self, first: char) -> Result<f64, String> {
        let mut text = String::from(first);
        while let Some(&c) = self.chars.peek() {
            if !(c.is_ascii_digit() || c == '.') {
                break;
            }
            text.push(c);
            self.chars.next();
        }
        text.parse().map_err(|_| format!("line {}: bad number '{text}'", self.line))
    }

    fn word(&mut self, first: char) -> Token {
        let mut text = String::from(first);
        while let Some(&c) = self.chars.peek() {
            if !(c.is_alphanumeric() || c == '_') {
                break;
            }
            text.push(c);
            self.chars.next();
        }
        match text.as_str() {
            "let" => Token::Let,
            "print" => Token::Print,
            _ => Token::Ident(text),
        }
    }

    fn string(&mut self) -> Result<Token, String> {
        let mut text = String::new();
        for c in self.chars.by_ref() {
            if c == '"' {
                return Ok(Token::Str(text));
            }
            text.push(c);
        }
        Err(format!("line {}: string never closed", self.line))
    }
}
