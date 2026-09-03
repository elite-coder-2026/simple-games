const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const w = canvas.width;
const h = canvas.height;

canvas.style.setProperty('width', w + 'px', 'important');
canvas.style.setProperty('height', h + 'px', 'important');

const paddle_w = 10
const paddle_h = 70
const paddle_speed = 6
const cpu_speed = 4.2
const ball_radius = 7
const win_score = 7

let left_score = right_score = 0
let keys = {}

document.addEventListener("keydown", e => keys[e.key] = true)
document.addEventListener("keyup", e => keys[e.key] = false)

const left = { x: 20, y: h / 2 - paddle_h / 2 }
const right = { x: w - 20 - paddle_w, y: h / 2 - paddle_h / 2 }

let ball = {x: w / 2, y: h / 2, vx: 0, vy: 0}

const serve = (dir) => {
    const angle = Math.random() * 0.6 - 0.3
    const speed = 5
    ball.x = w / 2
    ball.y = h / 2
    ball.vx = dir * speed * Math.cos(angle)
    ball.vy = speed * Math.sin(angle)
}

const resetMatch = () => {
    left_score = right_score = 0
    left.y = h / 2 - paddle_h / 2
    right.y = h / 2 - paddle_h / 2
    serve(Math.random() < 0.5 ? -1 : 1)
}

document.getElementById("reset").addEventListener("click", resetMatch)

const updateScore = _ => {
    document.getElementById('score').textContent = `${left_score} - ${right_score}`)
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

const update = _ => {
    if (keys['ArrowUp'] || keys['KeyW']) {
        right.y -= paddle_speed
    }

    if (keys['ArrowDown'] || keys['KeyS']) {
        right.y += paddle_speed
    }

    right.y = clamp(right.y, 0, h - paddle_h)

    if (Math.abs(target_y - left.y) > 4) {
        left.y += clamp(target_y - left.y, -cpu_speed, cpu_speed)
    }

    left.y = clamp(left.y, 0, h - paddle_h)

    ball.x += ball.vx
    ball.y += ball.vy

    if (ball.y - ball_radius < 0) {
        ball.y = ball_radius
        ball.vy *= -1
    }

    if (ball.y + ball_radius > h) {
        ball.y = h - ball_radius
        ball.vy *= -1
    }

    if (ball.vx < 0 && ball.x - ball_radius < left.x + paddle_w && ball.y > left.y && ball.y < left.y + paddle_h) {
        ball.x = left.x + paddle_w + ball_radius

        const rel = (ball.y - (left.y + paddle_h / 2)) / (paddle_h / 2)
        const speed = Math.min(9, Math.hypot(ball.vx, ball.vy) * 1.06)

        ball.vx = Math.cos(rel * 0.6) * speed
        ball.vy = Math.sin(rel * 0.6) * speed + rel * 1.5

        if (ball.vx > -2)
            ball.vx = -2
    }

    if (ball.x < -20) {
        right_score++
        updateScore()
        if (right_score >= win_score) {
            showBanner("Player wins!")
            resetMatch()
        } else {
            serve(1)
        }
    } else if (ball.x > w + 20) {
        left_score++
        updateScore()

        if (left_score >= win_score) {
            // alert("CPU wins!")
            showBanner("CPU wins!")
            resetMatch()
        } else {
            serve(-1)
        }
    }
}

const showBanner = (text) => {
    document.getElementById('msg').textContent = ' - press reset or keep playing to start a new match'

    setTimeout(_ => {
        document.getElementById('msg').textContent = 'Up/Down or W/S to move paddle, first to 7 points wins'
    }, 1800)
}

const draw = _ => {
    ctx.clearRect(0, 0, w, h)

    ctx.strokeStyle = '#333'
    ctx.setLineDash([6, 10])

    ctx.beginPath()
    ctx.moveTo(w / 2, 0)
    ctx.lineTo(w / 2, h)
    ctx.stroke()
    ctx.setLineDash([])

    ctx.fillStyle = '#60a5fa'
    ctx.fillRect(left.x, left.y, paddle_w, paddle_h)
    ctx.fillStyle = '#4ade80'
    ctx.fillRect(right.x, right.y, paddle_w, paddle_h)

    ctx.fillStyle = '#f5f5f5'
    ctx.beginPath()
    ctx.arc(ball.x, ball.y, ball_radius, 0, Math.PI * 2)
    ctx.fill()
}

const loop = _ => {
    update()
    draw()
    requestAnimationFrame(loop)
}

resetMatch()
loop()
