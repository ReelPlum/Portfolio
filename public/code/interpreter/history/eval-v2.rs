fn eval(expr: &Expr, env: &Env) -> Result<Value, Error> {
    match expr {
        Expr::Number(n) => Ok(Value::Number(*n)),
        Expr::Var(name) => env
            .get(name)
            .cloned()
            .ok_or_else(|| Error::Undefined(name.clone())),
        Expr::Binary(op, l, r) => {
            let l = eval(l, env)?;
            let r = eval(r, env)?;
            apply(op, l, r)
        }
    }
}
