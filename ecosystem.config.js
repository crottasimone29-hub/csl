module.exports = {
    apps: [
        {
            name: 'lora-ams-middleware',
            script: 'src/index.js',
            interpreter: 'node',
            exec_mode: 'fork',
            instances: 1,
            watch: false,
            autorestart: true,
            max_memory_restart: '300M',
            env: {
                NODE_ENV: 'production'
            }
        }
    ]
};