CREATE TABLE CDN (
    filename tinytext                not null,
    type     tinytext                not null,
    hash     tinytext                not null,
    `key`    tinytext                not null,
    location enum ('local', 'cloud') not null,
    constraint CDN_hash unique (hash) using hash,
    constraint CDN_key unique (`key`) using hash
);